import { describe, expect, it } from 'vitest';
import { getPlayerSlot } from './geminiService';
import { canAccessAdminDash } from './adminAccess';

describe('AI player routing and administrator access', () => {
  it('maps fixed game players to server-side configuration slots instead of display names', () => {
    expect(getPlayerSlot('ai1')).toBe('alapha');
    expect(getPlayerSlot('ai2')).toBe('beta');
  });

  it('only exposes AdminDash to the verified admin role', () => {
    expect(canAccessAdminDash('admin')).toBe(true);
    expect(canAccessAdminDash('user')).toBe(false);
  });
});
