export type AIChannelId = '1' | '2' | '3';

export interface AIChannelEnvironment {
  GEMINI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
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

async function ensureSuccess(response: Response): Promise<void> {
  if (!response.ok) {
    throw new AIChannelError(`AI provider request failed with HTTP ${response.status}`, response.status);
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
    const response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: request.systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: request.userMessage }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );
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
    const response = await fetcher(isOpenAI ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.systemInstruction },
          { role: 'user', content: request.userMessage },
        ],
        reasoning_effort: 'max',
        ...(isOpenAI ? {} : { thinking: { type: 'enabled' } }),
      }),
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
