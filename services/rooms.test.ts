import { describe, expect, it } from 'vitest';
import { availableRoomAiChannels, roomAiName, validateRoomDraft } from './rooms';

describe('room draft validation', () => {
  it('offers only unused providers when replacing a failed room AI', () => {
    expect(availableRoomAiChannels(['1', '2'], '1')).toEqual(['3']);
    expect(availableRoomAiChannels(['1', '2', '3'], '1')).toEqual([]);
  });

  it('accepts a 3-6 seat room with unique existing AI channels and a human host', () => {
    expect(validateRoomDraft({ seatCount: 5, aiChannels: ['1', '2', '3'] })).toEqual({ valid: true });
  });

  it('rejects duplicate AI channels, over-three AI seats, invalid seat counts, and rooms without a human', () => {
    expect(validateRoomDraft({ seatCount: 4, aiChannels: ['1', '1'] })).toMatchObject({ valid: false, error: 'AI channels must be unique' });
    expect(validateRoomDraft({ seatCount: 6, aiChannels: ['1', '2', '3', '4'] })).toMatchObject({ valid: false });
    expect(validateRoomDraft({ seatCount: 2, aiChannels: ['1'] })).toMatchObject({ valid: false, error: 'Room size must be between 3 and 6' });
    expect(validateRoomDraft({ seatCount: 3, aiChannels: ['1', '2', '3'] })).toMatchObject({ valid: false, error: 'A room requires at least one human player' });
  });

  it('uses Roman numerals only for room AI display labels', () => {
    expect(roomAiName('1')).toBe('I');
    expect(roomAiName('2')).toBe('II');
    expect(roomAiName('3')).toBe('III');
  });
});
