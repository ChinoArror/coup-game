import { describe, expect, it } from 'vitest';
import { RULES_COPY, type RulesLocale } from './rules';

describe('room rules copy', () => {
  (['zh', 'en'] as RulesLocale[]).forEach(locale => {
    it(`provides complete ${locale} Coup rules`, () => {
      const copy = RULES_COPY[locale];
      expect(copy.title).toBeTruthy();
      expect(copy.sections.map(section => section.title)).toContain(copy.timingTitle);
      expect(copy.sections.flatMap(section => section.items).join(' ')).toMatch(/10/);
      expect(copy.sections.flatMap(section => section.items).join(' ')).toMatch(/Coup|政变/);
    });
  });
});
