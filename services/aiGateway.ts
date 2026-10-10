export type AIChannelId = '1' | '2' | '3';

export interface AIChannelEnvironment {
  GEMINI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
  AI_RELAY_URL?: string;
  AI_RELAY_SHARED_SECRET?: string;
  Model_1?: string;
  Model_2?: string;
  Model_3?: string;
}

export interface AIChannelRequest {
  systemInstruction: string;
  userMessage: string;
}

export interface AIChannelResult {
  content: string;
  totalTokens: number;
}

export class AIChannelError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message);
    this.name = 'AIChannelError';
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function requireConfig(value: string | undefined, label: string): string {
  if (!value) throw new AIChannelError(`${label} is not configured`);
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signedRelayHeaders(
  env: AIChannelEnvironment,
  path: string,
  apiKey: string,
  body: string,
): Promise<{ url: string; headers: Headers }> {
  const relayUrl = new URL(requireConfig(env.AI_RELAY_URL, 'AI_RELAY_URL'));
  if (relayUrl.protocol !== 'https:' || relayUrl.username || relayUrl.password || relayUrl.search || relayUrl.hash) {
    throw new AIChannelError('AI_RELAY_URL must be a fixed HTTPS origin', 500);
  }
  const secret = requireConfig(env.AI_RELAY_SHARED_SECRET, 'AI_RELAY_SHARED_SECRET');
  if (secret.length < 32) throw new AIChannelError('AI_RELAY_SHARED_SECRET must be at least 32 characters', 500);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const canonical = ['POST', path, timestamp, nonce, await sha256Hex(body), await sha256Hex(apiKey)].join('\n');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)));
  const signature = btoa(String.fromCharCode(...signatureBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Upstream-API-Key': apiKey,
    'X-Relay-Timestamp': timestamp,
    'X-Relay-Nonce': nonce,
    'X-Relay-Signature': signature,
  });
  return { url: new URL(path, relayUrl).toString(), headers };
}

function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|AIza)[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .slice(0, 500);
}

async function ensureSuccess(response: Response): Promise<void> {
  if (!response.ok) {
    let detail = '';
    let errorCode = '';
    try {
      const body = await response.json() as { error?: unknown; message?: unknown };
      const providerError = typeof body.error === 'object' && body.error !== null
        ? body.error as Record<string, unknown>
        : undefined;
      const providerMessage = providerError && 'message' in providerError
        ? providerError.message
        : typeof body.error === 'string' ? body.error : body.message;
      if (typeof providerMessage === 'string') detail = `: ${sanitizeProviderMessage(providerMessage)}`;
      if (typeof providerError?.code === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(providerError.code)) {
        errorCode = ` [${providerError.code}]`;
      }
    } catch {
      // The provider did not return a JSON error payload.
    }
    const requestId = (
      response.headers.get('x-request-id') ?? response.headers.get('x-client-request-id')
    )?.trim();
    const requestIdDetail = requestId && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
      ? ` (request ID ${requestId})`
      : '';
    throw new AIChannelError(`AI provider request failed with HTTP ${response.status}${detail}${errorCode}${requestIdDetail}`, response.status);
  }
}

export async function callAIChannel(
  channelId: string,
  env: AIChannelEnvironment,
  request: AIChannelRequest,
  fetcher: Fetcher = fetch,
): Promise<AIChannelResult> {
  if (channelId === '1') {
    const apiKey = requireConfig(env.GEMINI_API_KEY, 'GEMINI_API_KEY');
    const model = requireConfig(env.Model_1, 'Model_1');
    if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new AIChannelError('Invalid Gemini model name', 400);
    const path = `/gemini/v1beta/models/${model}:generateContent`;
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: request.systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: request.userMessage }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const relay = await signedRelayHeaders(env, path, apiKey, body);
    const response = await fetcher(relay.url, { method: 'POST', headers: relay.headers, body });
    await ensureSuccess(response);
    const data = await response.json() as any;
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '{}',
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    };
  }

  if (channelId === '2' || channelId === '3') {
    const isOpenAI = channelId === '3';
    const apiKey = requireConfig(isOpenAI ? env.OPENAI_API_KEY : env.DEEPSEEK_API_KEY, isOpenAI ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY');
    const model = requireConfig(isOpenAI ? env.Model_3 : env.Model_2, isOpenAI ? 'Model_3' : 'Model_2');
    const path = isOpenAI ? '/openai/v1/chat/completions' : '/deepseek/chat/completions';
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: request.systemInstruction },
        { role: 'user', content: request.userMessage },
      ],
      reasoning_effort: isOpenAI ? 'high' : 'max',
      ...(isOpenAI ? {} : { thinking: { type: 'enabled' } }),
    });
    const relay = await signedRelayHeaders(env, path, apiKey, body);
    const response = await fetcher(relay.url, {
      method: 'POST',
      headers: relay.headers,
      body,
    });
    await ensureSuccess(response);
    const data = await response.json() as any;
    return {
      content: data.choices?.[0]?.message?.content || '{}',
      totalTokens: data.usage?.total_tokens || 0,
    };
  }

  throw new AIChannelError('Unsupported AI channel', 400);
}
