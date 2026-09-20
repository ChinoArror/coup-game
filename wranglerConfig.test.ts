import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Worker AI channel configuration', () => {
  it('defines all three model variables without placing API keys in [vars]', () => {
    const config = readFileSync('wrangler.toml', 'utf8');
    const vars = config.split('[vars]')[1]?.split('[[d1_databases]]')[0] || '';

    expect(vars).toContain('Model_1');
    expect(vars).toContain('Model_2');
    expect(vars).toContain('Model_3');
    expect(vars).not.toMatch(/(?:GEMINI|DEEPSEEK|OPENAI)_API_KEY\s*=/i);
  });
});
