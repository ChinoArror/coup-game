import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Worker AI channel configuration', () => {
  it('defines all three model variables without placing API keys in [vars]', () => {
    const config = readFileSync('wrangler.toml', 'utf8');
    const vars = config.split('[vars]')[1]?.split('[[d1_databases]]')[0] || '';

    expect(vars).toContain('Model_1');
    expect(vars).toContain('Model_2');
    expect(vars).toContain('Model_3');
    expect(vars).toContain('Model_1 = "gemini-3.8-flash"');
    expect(vars).toContain('Model_2 = "deepseek-flash"');
    expect(vars).toContain('Model_3 = "gpt-6-luna"');
    expect(vars).toContain('AI_RELAY_URL = "https://model.aryuki.com"');
    expect(vars).not.toMatch(/(?:GEMINI|DEEPSEEK|OPENAI)_API_KEY\s*=/i);
    expect(vars).not.toMatch(/AI_RELAY_SHARED_SECRET\s*=/i);
    expect(vars).not.toMatch(/(?:SSO_SECRET|PROTOCOL_PASSWORD|ADMIN_USER|ADMIN_PASS)\s*=/);
  });

  it('does not expose a provider API key through the Vite browser build', () => {
    const viteConfig = readFileSync('vite.config.ts', 'utf8');

    expect(viteConfig).not.toMatch(/GEMINI_API_KEY|process\.env\.API_KEY/);
  });
});
