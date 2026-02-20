export default {
    async fetch(request: Request, env: any) {
        const url = new URL(request.url);
        if (url.pathname === '/api/verify-password' && request.method === 'POST') {
            try {
                const body = await request.json() as any;
                const validPassword = env.PROTOCOL_PASSWORD || "Qwerasdf";
                if (body.password === validPassword) {
                    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
                }
                return new Response(JSON.stringify({ success: false, error: 'Invalid password' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            } catch (err) {
                return new Response(JSON.stringify({ success: false, error: 'Bad request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
        }

        if (url.pathname === '/api/ai' && request.method === 'POST') {
            try {
                const body = await request.json() as any;
                const { aiName, systemInstruction, userMessage } = body;

                let answer = "";

                if (aiName === "Gemini Alpha") {
                    const apiKey = env.GEMINI_API_KEY || env.Api_Key_Alpha;
                    const model = env.Model_Alpha || "gemini-1.5-flash";
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

                    if (!response.ok) {
                        return new Response(JSON.stringify({ error: await response.text() }), { status: 500 });
                    }
                    const data = await response.json() as any;
                    answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

                } else {
                    const apiKey = env.DeepseekApiKey || env.Api_Key_Beta;
                    // Usually deepseek-reasoner
                    const model = env.Model_Beta || "deepseek-reasoner";
                    const apiUrl = "https://api.deepseek.com/chat/completions";

                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [
                                { role: "system", content: systemInstruction },
                                { role: "user", content: userMessage }
                            ],
                            temperature: 0.6
                        })
                    });

                    if (!response.ok) {
                        return new Response(JSON.stringify({ error: await response.text() }), { status: 500 });
                    }
                    const data = await response.json() as any;
                    answer = data.choices?.[0]?.message?.content || "{}";
                }

                return new Response(JSON.stringify({ content: answer }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (e: any) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500 });
            }
        }
        // Serve assets (injected automatically when [assets] is defined in wrangler.toml)
        return env.ASSETS.fetch(request);
    }
}
