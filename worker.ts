import { getAIDecision } from './services/geminiService'; // wait, worker shouldn't import from frontend directly but the previous worker didn't import anything.

export default {
    async fetch(request: Request, env: any) {
        const url = new URL(request.url);
        const secret = env.PROTOCOL_PASSWORD || "Qwerasdf";
        const adminUser = env.ADMIN_USER || "admin";
        const adminPass = env.ADMIN_PASS || "Qwerasdf";

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

        async function sign(text: string) {
            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
            const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(text));
            return btoa(String.fromCharCode(...new Uint8Array(sig)));
        }

        async function getSessionUser(req: Request) {
            const cookies = parseCookies(req.headers.get('Cookie'));
            const session = cookies['coup_session'];
            if (!session) return null;
            try {
                const dec = atob(session);
                const [username, sig] = dec.split('|');
                const expectedSig = await sign(username);
                if (sig === expectedSig) return username;
            } catch (e) {
                return null;
            }
            return null;
        }

        const username = await getSessionUser(request);

        // API LOGOUT
        if (url.pathname === '/api/logout' && request.method === 'POST') {
            return new Response(JSON.stringify({ success: true }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Set-Cookie': 'coup_session=; Path=/; Max-Age=0;'
                }
            });
        }

        // // API ME
        if (url.pathname === '/api/me' && request.method === 'GET') {
            if (!username) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

            // check if paused from DB
            if (username !== adminUser) {
                const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
                if (!user || user.is_paused) {
                    return new Response(JSON.stringify({ error: 'paused' }), {
                        status: 403,
                        headers: { 'Set-Cookie': 'coup_session=; Path=/; Max-Age=0;' }
                    });
                }
            }
            return new Response(JSON.stringify({ username, role: username === adminUser ? 'admin' : 'user' }), { headers: { 'Content-Type': 'application/json' } });
        }

        // API LOGIN
        if (url.pathname === '/api/login' && request.method === 'POST') {
            try {
                const body = await request.json() as any;
                let isValid = false;
                let isPaused = false;

                if (body.username === adminUser && body.password === adminPass) {
                    isValid = true;
                } else {
                    const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND password = ?").bind(body.username, body.password).first();
                    if (user) {
                        if (user.is_paused) isPaused = true;
                        else isValid = true;
                    }
                }

                if (isPaused) {
                    return new Response(JSON.stringify({ success: false, error: 'Account paused' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
                }

                if (isValid) {
                    const sig = await sign(body.username);
                    const token = btoa(`${body.username}|${sig}`);
                    return new Response(JSON.stringify({ success: true, username: body.username, role: body.username === adminUser ? 'admin' : 'user' }), {
                        headers: {
                            'Content-Type': 'application/json',
                            'Set-Cookie': `coup_session=${token}; Path=/; Max-Age=604800; HttpOnly`
                        }
                    });
                }
                return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            } catch (err) {
                return new Response(JSON.stringify({ success: false, error: 'Bad request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // API ADMIN
        if (url.pathname.startsWith('/api/admin') && username !== adminUser) {
            return new Response('Unauthorized', { status: 401 });
        }
        if (url.pathname === '/api/admin/users' && request.method === 'GET') {
            const { results } = await env.DB.prepare("SELECT id, username, is_paused, created_at FROM users").all();
            return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
        }
        if (url.pathname === '/api/admin/users' && request.method === 'POST') {
            const body = await request.json() as any;
            const id = crypto.randomUUID();
            await env.DB.prepare("INSERT INTO users (id, username, password, created_at) VALUES (?, ?, ?, ?)").bind(id, body.username, body.password, Date.now()).run();
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (url.pathname.match(/^\/api\/admin\/users\/.*\/pause$/) && request.method === 'PUT') {
            const id = url.pathname.split('/')[4];
            await env.DB.prepare("UPDATE users SET is_paused = 1 WHERE id = ?").bind(id).run();
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (url.pathname.match(/^\/api\/admin\/users\/.*\/continue$/) && request.method === 'PUT') {
            const id = url.pathname.split('/')[4];
            await env.DB.prepare("UPDATE users SET is_paused = 0 WHERE id = ?").bind(id).run();
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        // API PROCESS
        if (url.pathname === '/api/process' && username) {
            if (request.method === 'GET') {
                const proc = await env.DB.prepare("SELECT state_json FROM process WHERE user_id = ?").bind(username).first();
                return new Response(JSON.stringify({ state: proc ? JSON.parse(proc.state_json) : null }), { headers: { 'Content-Type': 'application/json' } });
            }
            if (request.method === 'POST') {
                const body = await request.json() as any;
                await env.DB.prepare("INSERT INTO process (user_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at").bind(username, JSON.stringify(body.state), Date.now()).run();
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }
            if (request.method === 'DELETE') {
                await env.DB.prepare("DELETE FROM process WHERE user_id = ?").bind(username).run();
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }
        }

        // API LEADERBOARD
        if (url.pathname === '/api/leaderboard') {
            if (request.method === 'GET') {
                const { results } = await env.DB.prepare("SELECT * FROM leaderboard ORDER BY match_date DESC LIMIT 100").all();
                return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
            }
            if (request.method === 'POST' && username) {
                const body = await request.json() as any;
                const id = crypto.randomUUID();
                await env.DB.prepare("INSERT INTO leaderboard (id, username, match_date, place, duration_seconds) VALUES (?, ?, ?, ?, ?)").bind(id, username, Date.now(), body.place, body.duration).run();
                return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
            }
        }

        if (url.pathname === '/api/ai' && request.method === 'POST') {
            // Unchanged from previous logic
            try {
                const body = await request.json() as any;
                const { aiName, systemInstruction, userMessage } = body;
                let answer = "";
                if (aiName === "Gemini Alpha") {
                    const apiKey = env.GEMINI_API_KEY || env.Api_Key_Alpha;
                    const model = env.Model_Alpha || "gemini-2.0-flash";
                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_instruction: { parts: [{ text: systemInstruction }] }, contents: [{ role: 'user', parts: [{ text: userMessage }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.6 } }) });
                    if (!response.ok) return new Response(JSON.stringify({ error: await response.text() }), { status: 500 });
                    const data = await response.json() as any;
                    answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
                } else {
                    const apiKey = env.DeepseekApiKey || env.Api_Key_Beta;
                    const model = env.Model_Beta || "deepseek-reasoner";
                    const apiUrl = "https://api.deepseek.com/chat/completions";
                    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify({ model: model, messages: [{ role: "system", content: systemInstruction }, { role: "user", content: userMessage }], temperature: 0.6 }) });
                    if (!response.ok) return new Response(JSON.stringify({ error: await response.text() }), { status: 500 });
                    const data = await response.json() as any;
                    answer = data.choices?.[0]?.message?.content || "{}";
                }
                return new Response(JSON.stringify({ content: answer }), { headers: { 'Content-Type': 'application/json' } });
            } catch (e: any) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }); }
        }

        // Serve assets (injected automatically when [assets] is defined in wrangler.toml)
        return env.ASSETS.fetch(request);
    }
}
