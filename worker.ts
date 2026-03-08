export default {
    async fetch(request: Request, env: any, ctx: any) {
        const url = new URL(request.url);
        const SSO_URL = "https://accounts.aryuki.com";
        const APP_ID = env.SSO_APP_ID || "coup-game";
        const APP_SECRET = env.SSO_SECRET;

        // Cookie parsing
        function parseCookies(cookieStr: string | null) {
            const cookies: Record<string, string> = {};
            if (cookieStr) {
                cookieStr.split(';').forEach(c => {
                    const [k, v] = c.trim().split('=');
                    cookies[k] = v;
                });
            }
            return cookies;
        }

        function decodeJwt(token: string) {
            try {
                const parts = token.split('.');
                if (parts.length !== 3) return null;
                const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
                return JSON.parse(atob(padded));
            } catch (e) {
                return null;
            }
        }

        async function getSessionUser(req: Request) {
            const cookies = parseCookies(req.headers.get('Cookie'));
            const token = cookies['coup_session'];
            if (!token) return null;
            const payload = decodeJwt(token);
            if (!payload) return null;
            return {
                uuid: payload.uuid,
                username: payload.username,
                name: payload.name,
                token: token
            };
        }

        // Authority verification against SSO center
        async function verifyToken(token: string) {
            try {
                const res = await fetch(`${SSO_URL}/api/verify?app_id=${APP_ID}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) {
                    console.error('[SSO_VERIFY_FAIL]', res.status, await res.text());
                    return null;
                }
                const data = await res.json() as any;
                // Flexible structure: data.user or data directly
                const user = data.user || data;
                if (!user || !user.uuid) {
                    console.error('[SSO_VERIFY_INVALID_DATA]', data);
                    return null;
                }
                return user;
            } catch (e: any) {
                console.error('[SSO_VERIFY_EXCEPTION]', e.message);
                return null;
            }
        }

        const session = await getSessionUser(request);

        // API LOGOUT
        if (url.pathname === '/api/logout' && request.method === 'POST') {
            return new Response(JSON.stringify({ success: true }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Set-Cookie': 'coup_session=; Path=/; Domain=.aryuki.com; Max-Age=0;'
                }
            });
        }

        // SSO CALLBACK
        if (url.pathname === '/api/sso-callback' && request.method === 'POST') {
            try {
                const body = await request.json() as any;
                const token = body?.token;
                if (!token) return new Response('Missing token', { status: 400 });

                const user = await verifyToken(token);
                if (!user) return new Response('Verification failed: Unauthorized or Token Expired', { status: 401 });

                // Upsert into local D1
                try {
                    await env.DB.prepare(
                        'INSERT INTO users (uuid, user_id, name, username, token, first_seen, last_seen) ' +
                        'VALUES (?, ?, ?, ?, ?, ?, ?) ' +
                        'ON CONFLICT(uuid) DO UPDATE SET ' +
                        'name=excluded.name, username=excluded.username, token=excluded.token, last_seen=excluded.last_seen'
                    ).bind(
                        user.uuid,
                        user.user_id || 0,
                        user.name || user.username || 'Agent',
                        user.username || 'agent',
                        token,
                        Date.now(),
                        Date.now()
                    ).run();
                } catch (dbErr: any) {
                    console.error('[SSO_DB_ERROR]', dbErr);
                    return new Response(JSON.stringify({ error: `Database error: ${dbErr.message}` }), { status: 500 });
                }

                return new Response(JSON.stringify({ success: true }), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Set-Cookie': `coup_session=${token}; Path=/; Domain=.aryuki.com; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`
                    }
                });
            } catch (err: any) {
                console.error('[SSO_CALLBACK_ERROR]', err);
                return new Response(JSON.stringify({ error: err.message || 'Internal Callback Error' }), { status: 500 });
            }
        }

        // API ME
        if (url.pathname === '/api/me' && request.method === 'GET') {
            if (!session) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

            // Check if paused from DB
            const user = await env.DB.prepare("SELECT * FROM users WHERE uuid = ?").bind(session.uuid).first();
            if (user && user.is_paused) {
                return new Response(JSON.stringify({ error: 'paused' }), {
                    status: 403,
                    headers: { 'Set-Cookie': 'coup_session=; Path=/; Max-Age=0;' }
                });
            }

            return new Response(JSON.stringify({
                uuid: session.uuid,
                username: session.username,
                name: session.name,
                role: (session.username === env.ADMIN_USER || session.uuid === '0') ? 'admin' : 'user'
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        // API PROCESS
        if (url.pathname === '/api/process' && session) {
            if (request.method === 'GET') {
                const proc = await env.DB.prepare("SELECT * FROM process WHERE user_uuid = ?").bind(session.uuid).first();
                return new Response(JSON.stringify({ state: proc ? JSON.parse(proc.state_json) : null }), { headers: { 'Content-Type': 'application/json' } });
            }
            if (request.method === 'POST') {
                const body = await request.json() as any;
                await env.DB.prepare(
                    "INSERT INTO process (user_uuid, game_id, state_json, updated_at) VALUES (?, ?, ?, ?) " +
                    "ON CONFLICT(user_uuid) DO UPDATE SET game_id=excluded.game_id, state_json=excluded.state_json, updated_at=excluded.updated_at"
                ).bind(session.uuid, body.game_id, JSON.stringify(body.state), Date.now()).run();
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }
            if (request.method === 'DELETE') {
                await env.DB.prepare("DELETE FROM process WHERE user_uuid = ?").bind(session.uuid).run();
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }
        }

        // API LEADERBOARD
        if (url.pathname === '/api/leaderboard') {
            if (request.method === 'GET') {
                const { results } = await env.DB.prepare("SELECT * FROM leaderboard ORDER BY match_date DESC LIMIT 100").all();
                return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
            }
            if (request.method === 'POST' && session) {
                const body = await request.json() as any;
                const id = crypto.randomUUID();
                try {
                    await env.DB.prepare(
                        "INSERT INTO leaderboard (id, user_uuid, username, game_id, match_date, place, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)"
                    ).bind(id, session.uuid, session.name || session.username, body.game_id, Date.now(), body.place, body.duration).run();
                    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
                } catch (e: any) {
                    // Likely unique constraint violation for game_id
                    return new Response(JSON.stringify({ success: false, error: 'Already recorded' }), { status: 409 });
                }
            }
        }

        // AI PROXY WITH QUOTA
        if (url.pathname === '/api/ai' && request.method === 'POST' && session) {
            try {
                const body = await request.json() as any;
                const { aiName, systemInstruction, userMessage } = body;

                // 1. Quota Pre-check
                const checkRes = await fetch(`${SSO_URL}/api/quota/check?uuid=${session.uuid}&app_id=${APP_ID}`, {
                    headers: { "Authorization": `Bearer ${APP_SECRET}` }
                });

                if (!checkRes.ok) {
                    const status = checkRes.status;
                    const errText = await checkRes.text();
                    if (status === 429) return new Response(JSON.stringify({ error: "Quota exceeded: Please try again tomorrow." }), { status: 429 });
                    if (status === 403) return new Response(JSON.stringify({ error: "No quota authorization for this app." }), { status: 403 });
                    return new Response(JSON.stringify({ error: `Quota check failed: ${errText}` }), { status: 500 });
                }

                // 2. Call LLM
                let answer = "";
                let totalTokens = 0;

                if (aiName === "Gemini Alpha") {
                    const apiKey = env.GEMINI_API_KEY || env.Api_Key_Alpha;
                    const model = env.Model_Alpha || "gemini-2.0-flash";
                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            system_instruction: { parts: [{ text: systemInstruction }] },
                            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                            generationConfig: { responseMimeType: "application/json", temperature: 0.6 }
                        })
                    });
                    if (!response.ok) return new Response(JSON.stringify({ error: await response.text() }), { status: 500 });
                    const data = await response.json() as any;
                    answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
                    totalTokens = data.usageMetadata?.totalTokenCount || 0;
                } else {
                    const apiKey = env.DeepseekApiKey || env.Api_Key_Beta;
                    const model = env.Model_Beta || "deepseek-reasoner";
                    const apiUrl = "https://api.deepseek.com/chat/completions";
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: model,
                            messages: [{ role: "system", content: systemInstruction }, { role: "user", content: userMessage }],
                            temperature: 0.6
                        })
                    });
                    if (!response.ok) return new Response(JSON.stringify({ error: await response.text() }), { status: 500 });
                    const data = await response.json() as any;
                    answer = data.choices?.[0]?.message?.content || "{}";
                    totalTokens = data.usage?.total_tokens || 0;
                }

                // 3. Quota Post-deduction (Non-blocking)
                const consumeData = { uuid: session.uuid, app_id: APP_ID, tokens: totalTokens };
                ctx.waitUntil(fetch(`${SSO_URL}/api/quota/consume`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${APP_SECRET}` },
                    body: JSON.stringify(consumeData)
                }).then(r => {
                    if (!r.ok) r.text().then(t => console.error("Quota consumption error:", t));
                }).catch(e => console.error("Quota consumption fetch error:", e)));

                return new Response(JSON.stringify({ content: answer }), { headers: { 'Content-Type': 'application/json' } });
            } catch (e: any) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500 });
            }
        }

        // Fallback to Assets
        return env.ASSETS.fetch(request);
    }
}
