export const ROOM_AI_CHANNELS = ['1', '2', '3'] as const;
export type RoomAiChannel = typeof ROOM_AI_CHANNELS[number];
const ROOM_AI_NAMES = { '1': 'I', '2': 'II', '3': 'III' } as const;

export type RoomDraft = {
  seatCount: number;
  aiChannels: string[];
};

export type RoomDraftValidation = { valid: true } | { valid: false; error: string };

export const roomAiName = (channelId: RoomAiChannel): 'I' | 'II' | 'III' => ROOM_AI_NAMES[channelId];

/** Channels that can replace one AI without assigning a provider twice in one room. */
export const availableRoomAiChannels = (aiChannels: string[], currentChannel: string): RoomAiChannel[] =>
  ROOM_AI_CHANNELS.filter(channel => channel !== currentChannel && !aiChannels.includes(channel));

export const isRoomAiChannel = (value: string): value is RoomAiChannel => ROOM_AI_CHANNELS.includes(value as RoomAiChannel);

export const validateRoomDraft = ({ seatCount, aiChannels }: RoomDraft): RoomDraftValidation => {
  if (!Number.isInteger(seatCount) || seatCount < 3 || seatCount > 6) return { valid: false, error: 'Room size must be between 3 and 6' };
  if (aiChannels.length > 3 || aiChannels.some(channel => !isRoomAiChannel(channel))) return { valid: false, error: 'Select up to three existing AI channels' };
  if (new Set(aiChannels).size !== aiChannels.length) return { valid: false, error: 'AI channels must be unique' };
  if (seatCount - aiChannels.length < 1) return { valid: false, error: 'A room requires at least one human player' };
  return { valid: true };
};
