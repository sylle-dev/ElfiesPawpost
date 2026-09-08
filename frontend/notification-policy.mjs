export const channelDefaults = Object.freeze({ system: 'mute', say: 'mute', shout: 'mute', yell: 'mute', emote: 'mute', party: 'mentions', fc: 'mentions', alliance: 'mentions', novice: 'mute', ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`ls${i + 1}`, 'mentions'])), ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`cwls${i + 1}`, 'mentions'])) });
export function normalizePreferences(value) {
  const defaults = { sound: false, desktop: false, targetDesktop: true, tell: true, emote: true, target: true, mention: true, whileVisible: false };
  const input = value && typeof value === 'object' ? value : {};
  const result = { ...defaults, volume: 50, channels: { ...channelDefaults } };
  for (const key of Object.keys(defaults)) if (typeof input[key] === 'boolean') result[key] = input[key];
  for (const key of Object.keys(channelDefaults)) {
    const mode = input.channels?.[key];
    if (['mute', 'mentions', 'all'].includes(mode)) result.channels[key] = mode;
  }
  if (typeof input.volume === 'number' && Number.isFinite(input.volume))
    result.volume = Math.round(Math.max(0, Math.min(100, input.volume)));
  return result;
}
// The same decision drives sound, desktop notifications and unread badges.
// Global delivery settings (sound, focus, desktop permission) do not affect unread counts.
export function wantsNotice(event, preferences) {
  if (event.outgoing) return false;
  if (event.channel === 'tell') return preferences.tell;
  if (event.kind === 'target') return preferences.target;
  if (event.kind === 'emote') return preferences.emote;
  const mode = preferences.channels[event.channel] ?? 'mute';
  if (mode === 'mute') return false;
  if (mode === 'all') return true;
  return preferences.mention && event.attention;
}

export function activityEvents(events, filter, preferences) {
  return events.filter(e => filter === 'all' || filter === 'attention' && wantsNotice(e, preferences) || filter === 'emote' && e.channel === 'emote' || filter === 'target' && e.kind === 'target').sort((a, b) => b.id - a.id);
}

// Desktop delivery is independent of sound/unread visibility for target events.
export function wantsDesktopNotice(event, preferences) {
  return preferences.desktop && wantsNotice(event, preferences)
    && (event.kind !== 'target' || preferences.targetDesktop);
}

// Unknown game focus is silent; panel preferences never override game focus.
export function canDeliverNotice(event, preferences, gameFocused, panelFocused) {
  return gameFocused === false && event.suppressAlert === false
    && (!panelFocused || preferences.whileVisible) && wantsNotice(event, preferences);
}
