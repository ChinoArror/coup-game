import { describe, expect, it, vi } from 'vitest';
import { callAIChannel, type AIChannelEnvironment } from './aiGateway';

const env: AIChannelEnvironment = {
  GEMINI_API_KEY: 'gemini-test-key',
  DEEPSEEK_API_KEY: 'deepseek-test-key',
  OPENAI_API_KEY: 'openai-test-key',
  Model_1: 'gemini-3.8-flash',
  Model_2: 'deepseek-flash',
  Model_3: 'gpt-5.6-luna',
};

const request = {
  systemInstruction: 'Return JSON only.',
  userMessage: 'Choose PASS.',
};

describe('callAIChannel', () => {
  it('normalizes Gemini content and token usage from channel 1', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).toContain('models/gemini-3.8-flash:generateContent');
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
      expect(url).toBe('https://api.deepseek.com/chat/completions');
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
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer openai-test-key');
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'gpt-5.6-luna', reasoning_effort: 'max' });
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

  it('rejects an unknown channel without making an upstream request', async () => {
    const fetcher = vi.fn();

    await expect(callAIChannel('9', env, request, fetcher)).rejects.toThrow('Unsupported AI channel');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
