import { describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { callAIChannel, type AIChannelEnvironment } from './aiGateway';

const env: AIChannelEnvironment = {
  GEMINI_API_KEY: 'gemini-test-key',
  DEEPSEEK_API_KEY: 'deepseek-test-key',
  OPENAI_API_KEY: 'openai-test-key',
  Model_1: 'gemini-3.8-flash',
  Model_2: 'deepseek-flash',
  Model_3: 'gpt-6-luna',
  AI_RELAY_URL: 'https://model.aryuki.com',
  AI_RELAY_SHARED_SECRET: 'relay-shared-test-secret-at-least-32-bytes',
};

const request = {
  systemInstruction: 'Return JSON only.',
  userMessage: 'Choose PASS.',
};

function expectSignedRelayRequest(url: string, init: RequestInit | undefined, path: string, key: string) {
  expect(url).toBe(`https://model.aryuki.com${path}`);
  const headers = new Headers(init?.headers);
  expect(headers.get('X-Upstream-API-Key')).toBe(key);
  expect(headers.has('Authorization')).toBe(false);
  expect(new URL(url).search).toBe('');
  const timestamp = headers.get('X-Relay-Timestamp')!;
  const nonce = headers.get('X-Relay-Nonce')!;
  const body = String(init?.body);
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const canonical = ['POST', path, timestamp, nonce, hash(body), hash(key)].join('\n');
  const signature = createHmac('sha256', env.AI_RELAY_SHARED_SECRET!).update(canonical).digest('base64url');
  expect(headers.get('X-Relay-Signature')).toBe(signature);
}

describe('callAIChannel', () => {
  it('normalizes Gemini content and token usage from channel 1', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expectSignedRelayRequest(url, init, '/gemini/v1beta/models/gemini-3.8-flash:generateContent', 'gemini-test-key');
      expect(JSON.parse(String(init?.body)).generationConfig).not.toHaveProperty('temperature');
      return Response.json({
        candidates: [{ content: { parts: [{ text: '{"type":"PASS"}' }] } }],
        usageMetadata: { totalTokenCount: 11 },
      });
    });

    await expect(callAIChannel('1', env, request, fetcher)).resolves.toEqual({
      content: '{"type":"PASS"}',
      totalTokens: 11,
    });
  });

  it('normalizes DeepSeek content and token usage from channel 2', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expectSignedRelayRequest(url, init, '/deepseek/chat/completions', 'deepseek-test-key');
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'deepseek-flash', reasoning_effort: 'max', thinking: { type: 'enabled' } });
      return Response.json({
        choices: [{ message: { content: '{"type":"PASS"}' } }],
        usage: { total_tokens: 12 },
      });
    });

    await expect(callAIChannel('2', env, request, fetcher)).resolves.toEqual({
      content: '{"type":"PASS"}',
      totalTokens: 12,
    });
  });

  it('normalizes OpenAI content and token usage from channel 3', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expectSignedRelayRequest(url, init, '/openai/v1/chat/completions', 'openai-test-key');
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'high' });
      return Response.json({
        choices: [{ message: { content: '{"type":"PASS"}' } }],
        usage: { total_tokens: 13 },
      });
    });

    await expect(callAIChannel('3', env, request, fetcher)).resolves.toEqual({
      content: '{"type":"PASS"}',
      totalTokens: 13,
    });
  });

  it('returns a sanitized provider error detail when the OpenAI request is rejected', async () => {
    const fetcher = vi.fn(async () => Response.json({
      error: { message: 'Unsupported parameter: reasoning_effort. Authorization: Bearer sk-test-secret' },
    }, { status: 400 }));

    await expect(callAIChannel('3', env, request, fetcher)).rejects.toThrow(
      'Unsupported parameter: reasoning_effort. Authorization: Bearer [REDACTED]',
    );
  });

  it('rejects an unknown channel without making an upstream request', async () => {
    const fetcher = vi.fn();

    await expect(callAIChannel('9', env, request, fetcher)).rejects.toThrow('Unsupported AI channel');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails closed when the relay secret is not configured', async () => {
    const fetcher = vi.fn();
    await expect(callAIChannel('3', { ...env, AI_RELAY_SHARED_SECRET: undefined }, request, fetcher))
      .rejects.toThrow('AI_RELAY_SHARED_SECRET is not configured');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails closed when the relay secret is too short', async () => {
    const fetcher = vi.fn();
    await expect(callAIChannel('3', { ...env, AI_RELAY_SHARED_SECRET: 'short' }, request, fetcher))
      .rejects.toThrow('AI_RELAY_SHARED_SECRET must be at least 32 characters');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
