export type ChannelMode = 'mute' | 'mentions' | 'all';
export type Preferences = { sound: boolean; desktop: boolean; tell: boolean; emote: boolean; target: boolean; mention: boolean; whileVisible: boolean; channels: Record<string, ChannelMode> };
export const channelDefaults: Readonly<Record<string, ChannelMode>>;
export function normalizePreferences(value: unknown): Preferences;
export function wantsNotice(event: { outgoing: boolean; channel: string; kind: string; attention: boolean }, preferences: Preferences): boolean;

export function activityEvents<T extends { id: number; outgoing: boolean; channel: string; kind: string; attention: boolean }>(events: T[], filter: string, preferences: Preferences): T[];
