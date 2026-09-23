import { describe, expect, it } from 'vitest';
import { filterRoomSummaries, normalizeInviteToken, roomAiLabels, roomMobileClasses, roomStatusLabel } from './roomUi';

const rooms = [
  { id: 'open', status: 'open', seatCount: 3, aiChannels: ['1'], timeControls: {}, isReady: false, memberCount: 1 },
  { id: 'started', status: 'started', seatCount: 4, aiChannels: ['1', '3'], timeControls: {}, isReady: true, memberCount: 2 },
  { id: 'paused', status: 'paused', seatCount: 5, aiChannels: ['2'], timeControls: {}, isReady: true, memberCount: 3 },
  { id: 'closed', status: 'closed', seatCount: 3, aiChannels: [], timeControls: {}, isReady: false, memberCount: 1 },
] as const;

describe('room list presentation', () => {
  it('shows only active rooms by default and all rooms when requested', () => {
    expect(filterRoomSummaries(rooms, 'active').map(room => room.id)).toEqual(['open', 'started', 'paused']);
    expect(filterRoomSummaries(rooms, 'all').map(room => room.id)).toEqual(['open', 'started', 'paused', 'closed']);
  });

  it('uses colored status labels and Roman numeral AI labels', () => {
    expect(roomStatusLabel('started')).toMatchObject({ text: 'STARTED', className: expect.stringContaining('emerald') });
    expect(roomStatusLabel('paused')).toMatchObject({ text: 'PAUSED', className: expect.stringContaining('amber') });
    expect(roomStatusLabel('closed')).toMatchObject({ text: 'CLOSED', className: expect.stringContaining('slate') });
    expect(roomAiLabels(['1', '2', '3'])).toEqual(['I', 'II', 'III']);
  });

  it('keeps room controls usable in a narrow viewport', () => {
    expect(roomMobileClasses.actionGrid).toContain('grid-cols-2');
    expect(roomMobileClasses.actionGrid).toContain('md:grid-cols-4');
    expect(roomMobileClasses.touchTarget).toContain('min-h-11');
  });

  it('accepts either a bare invitation token or a complete invitation link', () => {
    expect(normalizeInviteToken('  0123456789abcdef0123456789abcdef  ')).toBe('0123456789abcdef0123456789abcdef');
    expect(normalizeInviteToken('https://coup.aryuki.com/game?invite=0123456789abcdef0123456789abcdef&source=share')).toBe('0123456789abcdef0123456789abcdef');
  });
});
