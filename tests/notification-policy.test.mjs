import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, wantsNotice, activityEvents } from '../frontend/notification-policy.mjs';
const event = (channel, extra = {}) => ({ channel, kind: 'chat', outgoing: false, attention: false, ...extra });
test('Limsa: 1000 ambient emotes and Say messages create no notices by default', () => {
  const prefs = normalizePreferences(null);
  const crowd = Array.from({length:1000}, (_, i) => i % 2 ? event('say') : event('emote', {kind:'ambient-emote'}));
  assert.equal(crowd.filter(e => wantsNotice(e, prefs)).length, 0);
});
test('directed emotes remain enabled independently of ambient emotes', () => {
  const prefs = normalizePreferences(null);
  assert.equal(wantsNotice(event('emote', {kind:'emote', attention:true}), prefs), true);
  prefs.emote = false;
  assert.equal(wantsNotice(event('emote', {kind:'emote', attention:true}), prefs), false);
});
test('mute overrides mentions, while mentions mode suppresses ordinary chatter', () => {
  const prefs = normalizePreferences(null);
  const mention = event('say', {kind:'mention', attention:true});
  assert.equal(wantsNotice(mention, prefs), false);
  prefs.channels.say = 'mentions';
  assert.equal(wantsNotice(mention, prefs), true);
  assert.equal(wantsNotice(event('say'), prefs), false);
  prefs.mention = false;
  assert.equal(wantsNotice(mention, prefs), false);
});
test('all mode permits regular messages only for the selected channel', () => {
  const prefs = normalizePreferences(null); prefs.channels.say = 'all';
  assert.equal(wantsNotice(event('say'), prefs), true);
  assert.equal(wantsNotice(event('shout'), prefs), false);
  prefs.channels.emote = 'all';
  assert.equal(wantsNotice(event('emote', {kind:'ambient-emote'}), prefs), true);
});
test('private messages and targets honor existing controls; own messages never alert', () => {
  const prefs = normalizePreferences(null);
  assert.equal(wantsNotice(event('tell', {attention:true}), prefs), true);
  assert.equal(wantsNotice(event('tell', {attention:true, outgoing:true}), prefs), false);
  prefs.tell = false; prefs.target = false;
  assert.equal(wantsNotice(event('tell', {attention:true}), prefs), false);
  assert.equal(wantsNotice(event('target', {kind:'target', attention:true}), prefs), false);
});
test('every linkshell can be configured independently', () => {
  const prefs = normalizePreferences(null); prefs.channels.cwls8 = 'all'; prefs.channels.ls2 = 'mute';
  assert.equal(wantsNotice(event('cwls8'), prefs), true);
  assert.equal(wantsNotice(event('cwls7'), prefs), false);
  assert.equal(wantsNotice(event('ls2', {attention:true}), prefs), false);
});
test('old preferences migrate without losing toggles or opting into noisy channels', () => {
  const prefs = normalizePreferences({sound:true, tell:false, emote:false});
  assert.equal(prefs.sound, true); assert.equal(prefs.tell, false); assert.equal(prefs.emote, false);
  assert.equal(prefs.channels.say, 'mute'); assert.equal(prefs.channels.emote, 'mute');
});
test('invalid stored settings are sanitized; valid per-channel settings survive', () => {
  const prefs = normalizePreferences({sound:'false', channels:{say:'all', shout:'invalid', unknown:'all'}});
  assert.equal(prefs.sound, false); assert.equal(prefs.channels.say, 'all'); assert.equal(prefs.channels.shout, 'mute');
  assert.equal(wantsNotice(event('unknown', {attention:true}), prefs), false);
  assert.equal(normalizePreferences(null).channels.say, 'mute');
});

test('system errors and ordinary system events stay silent, including with old preferences', () => {
  const prefs = normalizePreferences({mention:true});
  assert.equal(wantsNotice(event('system', {kind:'error', attention:true}), prefs), false);
  assert.equal(wantsNotice(event('system'), prefs), false);
  prefs.channels.system = 'all';
  assert.equal(wantsNotice(event('system', {kind:'error', attention:true}), prefs), true);
});
test('activity is newest first, updates with arrivals and keeps source chat order intact', () => {
  const prefs = normalizePreferences(null);
  const history = [1,2].map(id => ({...event('tell', {attention:true}), id}));
  assert.deepEqual(activityEvents(history, 'attention', prefs).map(e => e.id), [2,1]);
  history.push({...event('tell', {attention:true}), id:3});
  assert.deepEqual(activityEvents(history, 'attention', prefs).map(e => e.id), [3,2,1]);
  assert.deepEqual(history.map(e => e.id), [1,2,3]);
});
test('muted system events disappear from notifications but remain in all history', () => {
  const prefs = normalizePreferences(null);
  const history = [{...event('system', {kind:'error', attention:true}), id:2}, {...event('tell', {attention:true}), id:1}];
  assert.deepEqual(activityEvents(history, 'attention', prefs).map(e => e.id), [1]);
  assert.deepEqual(activityEvents(history, 'all', prefs).map(e => e.id), [2,1]);
});
test('nothing the player sends ever alerts, on any channel or filter', () => {
  const prefs = normalizePreferences(null);
  prefs.channels.say = 'all'; prefs.channels.fc = 'all';
  const mine = [
    {...event('tell', {attention:true, outgoing:true}), id:4},
    {...event('say', {outgoing:true}), id:3},
    {...event('fc', {kind:'mention', attention:true, outgoing:true}), id:2},
    {...event('tell', {attention:true}), id:1},
  ];
  assert.equal(mine.filter(e => wantsNotice(e, prefs)).length, 1);
  assert.deepEqual(activityEvents(mine, 'attention', prefs).map(e => e.id), [1]);
  assert.deepEqual(activityEvents(mine, 'all', prefs).map(e => e.id), [4,3,2,1]);
});
