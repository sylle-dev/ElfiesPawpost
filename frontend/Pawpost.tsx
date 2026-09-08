import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import './pawpost.css';
import { normalizePreferences, wantsNotice, wantsDesktopNotice, activityEvents, channelDefaults, type Preferences, type ChannelMode } from './notification-policy.mjs';

type PawEvent = { id: number; at: string; kind: string; channel: string; sender: string; world: string; text: string; outgoing: boolean; attention: boolean; conversation: string | null };
type Watcher = { name: string; world: string; distance: number };
type RecentWatcher = { name: string; world: string; lastSeen: string };
type Snapshot = { session: string; cursor: number; events: PawEvent[]; watchers: Watcher[]; recentWatchers?: RecentWatcher[]; player: { online: boolean; name: string; world: string; zone: string; targetTracking: boolean } };
type TogglePreference = Exclude<keyof Preferences, 'channels' | 'volume'>;
const defaults = normalizePreferences(null);
const channelNames: Record<string, string> = { tell: 'Private', say: 'Say', party: 'Party', fc: 'Free Company', alliance: 'Alliance', shout: 'Shout', yell: 'Yell', novice: 'Novice Network', emote: 'Emote', target: 'Target', system: 'System', ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`ls${i + 1}`, `Linkshell ${i + 1}`])), ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`cwls${i + 1}`, `CW Linkshell ${i + 1}`])) };
const sendable = ['say', 'party', 'fc', 'alliance', 'shout', 'yell', ...Array.from({ length: 8 }, (_, i) => `ls${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `cwls${i + 1}`)];
const emptyPlayer = { online: false, name: '', world: '', zone: '', targetTracking: false };
const time = (at: string) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const initials = (name: string) => name.split(' ').map(s => s[0]).slice(0, 2).join('');
const eventSymbol = (event: PawEvent) => event.kind === 'target' ? 'eye' : event.channel === 'emote' ? 'heart' : event.kind === 'mention' ? 'spark' : event.kind === 'error' ? 'bell' : 'mail';

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    moon: <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
    eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    spark: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" /><path d="M20 2v4m-2-2h4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4L22 2Z" /><path d="m11 13 7-7" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="16" cy="17" r="3" /></>,
    paw: <><ellipse cx="12" cy="16" rx="6" ry="4.5" /><ellipse cx="4" cy="9" rx="2" ry="2.5" /><ellipse cx="9" cy="5" rx="2" ry="2.5" /><ellipse cx="15" cy="5" rx="2" ry="2.5" /><ellipse cx="20" cy="9" rx="2" ry="2.5" /></>,
    hash: <path d="M5 9h15M4 15h15M10 3 8 21M17 3l-2 18" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.mail}</svg>;
}

function loadPreferences(): Preferences {
  try { return normalizePreferences(JSON.parse(localStorage.getItem('elfie.preferences') || '{}')); } catch { return defaults; }
}
function getKey() {
  const key = new URLSearchParams(window.location.hash.slice(1)).get('key');
  if (key) { sessionStorage.setItem('elfie.key', key); history.replaceState(null, '', location.pathname + location.search); }
  return key || sessionStorage.getItem('elfie.key') || '';
}

export default function Pawpost() {
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const [key] = useState(getKey);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('elfie.theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#19161f' : '#f5f1f7');
    try { localStorage.setItem('elfie.theme', theme); } catch { /* Theme still works without storage. */ }
  }, [theme]);
  const [events, setEvents] = useState<PawEvent[]>([]);
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [recentWatchers, setRecentWatchers] = useState<RecentWatcher[]>([]);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const pastWatchers = recentWatchers.filter(w => clock - Date.parse(w.lastSeen) < 30 * 60000
    && !watchers.some(live => live.name === w.name && live.world === w.world));
  const lastSeenLabel = (at: string) => {
    const minutes = Math.max(0, Math.floor((clock - Date.parse(at)) / 60000));
    return minutes < 1 ? 'Just now' : `${minutes} min ago`;
  };
  const [player, setPlayer] = useState(emptyPlayer);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline' | 'locked'>(key ? 'connecting' : 'locked');
  const [view, setView] = useState('activity');
  const [filter, setFilter] = useState('attention');
  const [preferences, setPreferences] = useState(loadPreferences);
  const [settings, setSettings] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [contacts, setContacts] = useState<string[]>([]);
  const [closedConversations, setClosedConversations] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const cursor = useRef(0);
  const session = useRef('');
  const initialized = useRef(false);
  const preferencesRef = useRef(preferences);
  const viewRef = useRef(view);
  const audio = useRef<AudioContext | null>(null);
  const lastAlert = useRef(0);
  const timeline = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const newChatDialog = useRef<HTMLDialogElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);
  const [newAway, setNewAway] = useState(false);

  preferencesRef.current = preferences;
  viewRef.current = view;
  useEffect(() => { localStorage.setItem('elfie.preferences', JSON.stringify(preferences)); setNewAway(false); }, [preferences]);
  useEffect(() => { if (newChat) newChatDialog.current?.showModal(); else newChatDialog.current?.close(); }, [newChat]);
  useEffect(() => { if (settings) settingsDialog.current?.showModal(); else settingsDialog.current?.close(); }, [settings]);

  const matches = (event: PawEvent, selected: string) => selected.startsWith('dm:') ? event.channel === 'tell' && event.conversation === selected.slice(3)
    : selected.startsWith('channel:') ? event.channel === selected.slice(8) : wantsNotice(event, preferencesRef.current);

  function chime() {
    if (!audio.current || audio.current.state !== 'running' || preferencesRef.current.volume === 0) return;
    const ctx = audio.current;
    [660, 880].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.frequency.value = frequency;
      const start = ctx.currentTime + index * 0.13;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.24 * preferencesRef.current.volume / 100, start + 0.015); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      oscillator.start(start); oscillator.stop(start + 0.25);
    });
  }
  function alertFor(incoming: PawEvent[]) {
    const prefs = preferencesRef.current;
    if (!prefs.whileVisible && document.hasFocus() && !document.hidden) return;
    const eligible = incoming.filter(e => wantsNotice(e, prefs));
    if (!eligible.length || Date.now() - lastAlert.current < 1800) return;
    lastAlert.current = Date.now();
    if (prefs.sound) chime();
    const desktopEvents = eligible.filter(event => wantsDesktopNotice(event, prefs));
    if (desktopEvents.length && 'Notification' in window && Notification.permission === 'granted') {
      const event = desktopEvents[desktopEvents.length - 1];
      const notification = new Notification(`${event.sender} · ${channelNames[event.channel] || event.channel}`, { body: event.text, icon: '/elfie-courier.png', tag: 'elfie-pawpost' });
      notification.onclick = () => { window.focus(); if (event.conversation) openConversation(event.conversation); else setView('activity'); notification.close(); };
    }
  }
  function accept(snapshot: Snapshot) {
    const reset = session.current !== snapshot.session;
    const fresh = reset ? snapshot.events : snapshot.events.filter(e => e.id > cursor.current);
    if (reset) {
      setEvents(fresh); setUnread(new Set()); setClosedConversations(new Set());
      if (session.current) { setContacts([]); setDrafts({}); setView('activity'); }
      initialized.current = false;
    } else if (fresh.length) {
      setEvents(old => [...old, ...fresh].slice(-1500));
      const incoming = new Set(fresh.filter(e => e.channel === 'tell' && !e.outgoing && e.conversation).map(e => e.conversation!));
      if (incoming.size) setClosedConversations(old => new Set([...old].filter(identity => !incoming.has(identity))));
    }
    setWatchers(snapshot.watchers); setRecentWatchers(snapshot.recentWatchers ?? []); setClock(Date.now()); setPlayer(snapshot.player); setConnection('live');
    if (initialized.current) {
      alertFor(fresh);
      setUnread(old => new Set([...old, ...fresh.filter(e => wantsNotice(e, preferencesRef.current) && (document.hidden || !document.hasFocus() || !matches(e, viewRef.current))).map(e => e.id)].filter(id => id > snapshot.cursor - 1500)));
    }
    session.current = snapshot.session; cursor.current = snapshot.cursor; initialized.current = true;
  }

  useEffect(() => {
    if (demo) {
      const samples: PawEvent[] = [
        { id: 1, at: new Date(Date.now() - 180000).toISOString(), kind: 'chat', channel: 'tell', sender: 'Luna Moonpetal', world: 'Moogle', text: 'Elfie! Fancy a drink in Gridania? \u2661', outgoing: false, attention: true, conversation: 'Luna Moonpetal@Moogle' },
        { id: 2, at: new Date(Date.now() - 110000).toISOString(), kind: 'emote', channel: 'emote', sender: 'Miu Stardust', world: 'Ragnarok', text: 'Miu Stardust waves at you.', outgoing: false, attention: true, conversation: null },
        { id: 3, at: new Date(Date.now() - 50000).toISOString(), kind: 'target', channel: 'target', sender: 'Miu Stardust', world: 'Ragnarok', text: 'Targeted you.', outgoing: false, attention: true, conversation: null },
        { id: 4, at: new Date(Date.now() - 20000).toISOString(), kind: 'mention', channel: 'fc', sender: 'Nora Rose', world: 'Moogle', text: 'Elfie, we saved a spot for you in the party \u2728', outgoing: false, attention: true, conversation: null },
      ];
      accept({ session: 'demo', cursor: 4, events: samples, recentWatchers: [{ name: 'Nora Rose', world: 'Moogle', lastSeen: new Date(Date.now() - 3 * 60000).toISOString() }, { name: 'Luna Moonpetal', world: 'Moogle', lastSeen: new Date(Date.now() - 12 * 60000).toISOString() }], watchers: [{ name: 'Miu Stardust', world: 'Ragnarok', distance: 3.2 }], player: { online: true, name: 'Elfie Pawpost', world: 'Moogle', zone: 'New Gridania', targetTracking: true } });
      return;
    }
    if (!key) return;
    let closed = false;
    let controller: AbortController;
    let retryTimer: ReturnType<typeof setTimeout>;
    async function connect() {
      controller = new AbortController();
      let heartbeat: ReturnType<typeof setTimeout>;
      try {
        const response = await fetch(`/api/stream?after=${cursor.current}&session=${encodeURIComponent(session.current)}`, { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal });
        if (response.status === 401) { setConnection('locked'); return; }
        if (!response.ok || !response.body) throw new Error('Disconnected');
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (!closed) {
          heartbeat = setTimeout(() => controller.abort(), 15000);
          const { value, done } = await reader.read(); clearTimeout(heartbeat);
          if (done) throw new Error('Stream ended');
          buffer += decoder.decode(value, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            if (line.startsWith('data: ')) accept(JSON.parse(line.slice(6)) as Snapshot);
          }
        }
      } catch { if (!closed) { setConnection('offline'); setWatchers([]); } }
      finally { clearTimeout(heartbeat!); }
      if (!closed) retryTimer = setTimeout(connect, 2500);
    }
    void connect();
    return () => { closed = true; controller?.abort(); clearTimeout(retryTimer); };
  }, [key, demo]);

  useEffect(() => {
    const read = () => {
      if (document.hidden || !document.hasFocus()) {
        setUnread(old => new Set([...old].filter(id => events.some(e => e.id === id && wantsNotice(e, preferences)))));
        return;
      }
      setUnread(old => new Set([...old].filter(id => events.some(e => e.id === id && wantsNotice(e, preferences) && !matches(e, view)))));
    };
    read(); window.addEventListener('focus', read); document.addEventListener('visibilitychange', read);
    return () => { window.removeEventListener('focus', read); document.removeEventListener('visibilitychange', read); };
  }, [view, events, preferences]);
  useEffect(() => { document.title = unread.size ? `(${unread.size}) Elfie's Pawpost` : "Elfie's Pawpost"; }, [unread]);
  useEffect(() => { pinned.current = true; setNewAway(false); setError(''); setNotice(''); setMenuOpen(false); }, [view]);

  const conversations = useMemo(() => [...new Set([...contacts, ...events.filter(e => e.channel === 'tell' && e.conversation).map(e => e.conversation!)])]
    .filter(identity => !closedConversations.has(identity))
    .sort((a, b) => (events.findLast(e => e.conversation === b)?.id || 0) - (events.findLast(e => e.conversation === a)?.id || 0)), [events, contacts, closedConversations]);
  const unreadFor = (selected: string) => events.filter(e => unread.has(e.id) && matches(e, selected)).length;
  const selectedRecipient = view.startsWith('dm:') ? view.slice(3) : '';
  const selectedChannel = selectedRecipient ? 'tell' : view.startsWith('channel:') ? view.slice(8) : '';
  const visibleEvents = view === 'activity' ? activityEvents(events, filter, preferences) : events.filter(e => matches(e, view));
  const newestVisibleId = view === 'activity' ? visibleEvents[0]?.id : visibleEvents.at(-1)?.id;
  const writable = (selectedChannel === 'tell' && !!selectedRecipient) || sendable.includes(selectedChannel);
  const canSend = connection === 'live' && player.online && writable;
  const draft = drafts[view] || '';
  const byteLength = new TextEncoder().encode((selectedRecipient ? `/tell ${selectedRecipient} ` : `/${selectedChannel} `) + draft.trim()).length;
  const title = view === 'activity' ? 'Your corner of Eorzea' : selectedRecipient ? selectedRecipient.split('@')[0] : channelNames[selectedChannel] || selectedChannel;

  // Activity reads newest first, so its live edge is the top; a conversation keeps growing downwards.
  useEffect(() => {
    const element = timeline.current;
    if (!element) return;
    const top = view === 'activity';
    const newest = top ? visibleEvents[0] : visibleEvents[visibleEvents.length - 1];
    if (pinned.current) element.scrollTo({ top: top ? 0 : element.scrollHeight });
    else if (newest && wantsNotice(newest, preferencesRef.current)) setNewAway(true);
  }, [newestVisibleId, view, filter]);

  async function enableAlerts() {
    try {
      audio.current ||= new AudioContext(); await audio.current.resume();
      let desktop = false;
      if ('Notification' in window) desktop = (await Notification.requestPermission()) === 'granted';
      setPreferences(old => ({ ...old, sound: true, desktop }));
      chime(); setNotice(desktop ? 'Alerts are on. Adjust them whenever you like.' : 'Sound is on. Desktop notifications were not granted.');
    } catch { setNotice('The browser could not start the sound. Check its permissions.'); }
  }
  async function sendMessage() {
    if (busy.current || !canSend || !draft.trim()) return;
    const outgoingView = view; const outgoingText = draft;
    busy.current = true; setSending(true); setError(''); setNotice('');
    try {
      if (draft.trim().startsWith('/') || /[\r\n\x00-\x1f]/.test(draft) || byteLength > 500) throw new Error('Send a single line, without commands, within the 500-byte limit.');
      if (demo) {
        setEvents(old => [...old, { id: ++cursor.current, at: new Date().toISOString(), kind: 'chat', channel: selectedChannel, sender: selectedRecipient.split('@')[0] || player.name, world: selectedRecipient.split('@')[1] || player.world, text: outgoingText.trim(), outgoing: true, attention: false, conversation: selectedRecipient || null }]);
        setNotice('Preview message: nothing was sent to FFXIV.');
      } else {
        const response = await fetch('/api/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ channel: selectedChannel, recipient: selectedRecipient || null, text: outgoingText }), signal: AbortSignal.timeout(7000) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || result.message || 'The message could not be sent.');
        setNotice(result.message);
      }
      setDrafts(old => ({ ...old, [outgoingView]: old[outgoingView] === outgoingText ? '' : old[outgoingView] }));
      input.current?.focus();
    } catch (exception) { setError(exception instanceof Error && exception.name !== 'TimeoutError' ? exception.message : 'The send could not be confirmed. Check the conversation before resending.'); }
    finally { busy.current = false; setSending(false); }
  }
  function openConversation(identity: string) {
    setClosedConversations(old => { const next = new Set(old); next.delete(identity); return next; });
    setContacts(old => [...new Set([...old, identity])]);
    setView('dm:' + identity);
  }
  function closeConversation(identity: string) {
    setClosedConversations(old => new Set([...old, identity]));
    setContacts(old => old.filter(contact => contact !== identity));
    const messageIds = new Set(events.filter(event => event.conversation === identity).map(event => event.id));
    setUnread(old => new Set([...old].filter(id => !messageIds.has(id))));
    setView(old => old === 'dm:' + identity ? 'activity' : old);
  }

  useEffect(() => {
    // Optional browser capability: stage a visible draft, never send a game message.
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: 'stage_private_message', title: 'Stage a private message',
        description: 'Opens a conversation and stages a visible draft. It never sends to the game; the person presses Send.',
        inputSchema: { type: 'object', properties: { recipient: { type: 'string' }, text: { type: 'string' } }, required: ['recipient', 'text'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(value: unknown) {
          const candidate = value as { recipient?: unknown; text?: unknown } | null;
          if (!candidate || typeof candidate.recipient !== 'string' || typeof candidate.text !== 'string' ||
            !/^[A-Za-z'-]{2,15} [A-Za-z'-]{2,15}@[A-Za-z][A-Za-z0-9-]{1,31}$/.test(candidate.recipient) ||
            /[\x00-\x1f\u2028\u2029]/.test(candidate.text) || candidate.text.trim().startsWith('/') ||
            new TextEncoder().encode(`/tell ${candidate.recipient} ${candidate.text.trim()}`).length > 500)
            throw new Error('Invalid recipient or draft.');
          const target = candidate.recipient; const text = candidate.text;
          flushSync(() => { openConversation(target); setDrafts(old => ({ ...old, ['dm:' + target]: text })); });
          return { staged: true, sent: false, recipient: target };
        },
      }, { signal: lifecycle.signal })).catch(() => { /* optional browser integration */ });
    } catch { /* unavailable implementation */ }
    return () => lifecycle.abort();
  }, []);
  const connectionText = demo ? 'Preview mode' : connection === 'locked' ? 'Not connected' : connection === 'offline' ? 'Reconnecting…' : connection === 'connecting' ? 'Connecting…' : player.online ? 'In Eorzea' : 'Waiting for your character';

  return <div className="pawpost">
    <a className="skip-link" href="#conversation">Skip to the messages</a>
    {demo && <div className="demo-banner">Preview mode · fictional characters and messages · nothing is sent to FFXIV</div>}
    <header className="app-header">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setView('activity'); }}><span className="brand-mark"><Icon name="paw" size={26} /></span><span>Elfie’s <strong>Pawpost</strong><small>EORZEA MAILBOX</small></span></a>
      <div className={`connection ${connection === 'live' && player.online ? 'connected' : ''}`}><span className="status-dot" />{connectionText}</div>
      <div className="header-actions"><button className="icon-button" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button><button className="soft-button alert-button" onClick={enableAlerts}><Icon name="bell" />Turn on alerts</button><button className="icon-button" title="Alert settings" aria-label="Alert settings" onClick={() => setSettings(true)}><Icon name="settings" /></button></div>
    </header>
    <div className="workspace">
      <aside className={`sidebar ${menuOpen ? 'mobile-open' : ''}`} aria-label="Conversations and channels">
        <div className="sidebar-heading"><span>YOUR MAILBOX</span><span className="tiny-paw">✦</span></div>
        <button className={`nav-item ${view === 'activity' ? 'selected' : ''}`} onClick={() => setView('activity')}><Icon name="spark" /><span>Activity</span>{unreadFor('activity') > 0 && <b className="counter">{unreadFor('activity')}</b>}</button>
        <div className="section-label">PRIVATE<button className="icon-button small" onClick={() => { setRecipient(''); setNewChat(true); }} aria-label="New private message" title="New private message"><Icon name="plus" size={18} /></button></div>
        <div className="conversation-list">
          {conversations.map(identity => <div className="person-row" key={identity}><button className={`person-item ${view === 'dm:' + identity ? 'selected' : ''}`} onClick={() => openConversation(identity)}><span className="avatar">{initials(identity.split('@')[0])}</span><span className="person-name">{identity.split('@')[0]}<small>{identity.split('@')[1]}</small></span>{unreadFor('dm:' + identity) > 0 && <b className="counter">{unreadFor('dm:' + identity)}</b>}</button><button className="icon-button close-conversation" aria-label={`Close conversation with ${identity}`} title="Close conversation" onClick={() => closeConversation(identity)}><Icon name="close" size={15} /></button></div>)}
          {!conversations.length && <p className="quiet-note">Your conversations will show up here.</p>}
        </div>
        <button className="new-message" onClick={() => { setRecipient(''); setNewChat(true); }}><Icon name="plus" size={17} />New private message</button>
        <div className="section-label">CHANNELS</div>
        {['say', 'party', 'fc', 'emote'].map(channel => <button key={channel} className={`nav-item ${view === 'channel:' + channel ? 'selected' : ''}`} onClick={() => setView('channel:' + channel)}><Icon name={channel === 'emote' ? 'heart' : 'hash'} size={18} /><span>{channelNames[channel]}</span>{unreadFor('channel:' + channel) > 0 && <b className="counter">{unreadFor('channel:' + channel)}</b>}</button>)}
        <label className="other-channels"><span>More channels</span><select aria-label="Open another channel" value="" onChange={e => { if (e.target.value) setView('channel:' + e.target.value); }}><option value="">Choose a channel…</option>{['tell', ...sendable.filter(c => !['say', 'party', 'fc'].includes(c)), 'novice', 'system'].map(c => <option key={c} value={c}>{c === 'tell' ? 'All private messages' : channelNames[c]}</option>)}</select></label>
        <div className="sidebar-mascot"><img src="/elfie-courier.png" alt="Elfie, a catgirl courier holding an envelope" /><span>Mail with a little bit of magic <span aria-hidden="true">♡</span></span></div>
        <div className="player-card"><span className="avatar mint"><Icon name="paw" /></span><div><strong>{player.name || 'Your character'}</strong><small>{player.world || 'Open the game to connect'}</small></div></div>
      </aside>
      <main id="conversation" className="main-panel">
        <div className="conversation-heading"><div><div className="eyebrow">{view === 'activity' ? 'EVERYTHING MEANT FOR YOU' : selectedRecipient ? `PRIVATE · ${selectedRecipient.split('@')[1]}` : 'EORZEA CHAT'}</div><h1>{title}<span className="heading-spark" aria-hidden="true">✧</span></h1><p>{view === 'activity' ? 'Messages, waves and glances. Newest first.' : selectedRecipient ? 'This conversation sends messages with /tell.' : `Messages from ${channelNames[selectedChannel] || selectedChannel}.`}</p></div>{selectedRecipient && <button className="icon-button" aria-label="Close current conversation" title="Close conversation" onClick={() => closeConversation(selectedRecipient)}><Icon name="close" /></button>}<button className="mobile-menu soft-button" onClick={() => setMenuOpen(!menuOpen)}>Mailbox</button>{view === 'activity' && <button className="read-button" onClick={() => setUnread(new Set())} title="Mark everything as read"><Icon name="check" size={17} /><span>Mark all read</span></button>}</div>
        {(connection !== 'live' || !player.online) && <div className="connection-banner" role="status"><Icon name="mail" /><span>{connection === 'locked' ? <>Open this mailbox with <strong>/elfie</strong> in game to connect.</> : connection === 'live' ? 'The panel is ready. Log in with your character to receive and send messages.' : 'Waiting for the plugin. Your history stays here; sending returns once it reconnects.'}</span></div>}
        {view === 'activity' && <div className="filter-bar" aria-label="Filter activity">{[['attention', 'For you'], ['all', 'Everything'], ['emote', 'Emotes'], ['target', 'Glances']].map(([id, label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}<span className="session-note">Newest first · Live</span></div>}
        <div className="timeline-wrap"><div className="timeline" ref={timeline} onScroll={() => { const el = timeline.current!; pinned.current = viewRef.current === 'activity' ? el.scrollTop < 70 : el.scrollHeight - el.scrollTop - el.clientHeight < 70; if (pinned.current) setNewAway(false); }}>
          <div className="date-divider"><span>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</span></div>
          {!visibleEvents.length && <div className="empty-state"><span className="empty-envelope"><Icon name={selectedRecipient ? 'mail' : 'paw'} size={44} /></span><h2>{selectedRecipient ? 'A new thread, a little hello' : 'Your mailbox is waiting'}</h2><p>{selectedRecipient ? 'Write below to start the conversation.' : 'When someone writes, waves or targets you, it lands here.'}</p><span className="empty-decoration" aria-hidden="true">✧　♡　✧</span></div>}
          {visibleEvents.map(event => view === 'activity' || event.kind === 'target' || event.channel === 'emote' || event.kind === 'error' ? <article key={event.id} className={`activity-card kind-${event.kind} ${unread.has(event.id) ? 'unread' : ''}`}><span className="event-icon"><Icon name={eventSymbol(event)} size={21} /></span><div className="event-body"><div className="event-top"><strong>{event.outgoing ? 'You' : event.sender}</strong><span className={`channel-chip chip-${event.channel}`}>{channelNames[event.channel] || event.channel}</span><time dateTime={event.at}>{time(event.at)}</time></div><p>{event.text}</p><div className="event-bottom"><span>{event.world}{event.kind === 'emote' ? ' · Aimed at you' : event.kind === 'ambient-emote' ? ' · Nearby' : event.kind === 'mention' ? ' · You were mentioned' : ''}</span>{event.conversation && <button onClick={() => openConversation(event.conversation!)}>Open conversation <span aria-hidden="true">↗</span></button>}</div></div></article> : <article key={event.id} className={`message ${event.outgoing ? 'outgoing' : ''}`}><span className="avatar">{event.outgoing ? <Icon name="paw" size={18} /> : initials(event.sender)}</span><div className="message-content"><div className="message-meta"><strong>{event.outgoing ? 'You' : event.sender}</strong><time dateTime={event.at}>{time(event.at)}</time></div><div className="bubble">{event.text}</div></div></article>)}
        </div>
        {newAway && <button className={`timeline-pill ${view === 'activity' ? 'above' : 'below'}`} onClick={() => { timeline.current?.scrollTo({ top: view === 'activity' ? 0 : timeline.current.scrollHeight, behavior: 'smooth' }); pinned.current = true; setNewAway(false); }}>{view === 'activity' ? 'New notices ↑' : 'New messages ↓'}</button>}</div>
        <div className="feedback" aria-live="polite">{error ? <p className="error-message" role="alert">{error}</p> : notice ? <p>{notice}</p> : null}</div>
        {writable ? <form className="composer" onSubmit={e => { e.preventDefault(); void sendMessage(); }}><label htmlFor="message-input">Send to <strong>{selectedRecipient || channelNames[selectedChannel]}</strong></label><div className="compose-box"><textarea id="message-input" ref={input} value={draft} onChange={e => setDrafts(old => ({ ...old, [view]: e.target.value }))} placeholder={canSend ? 'Write something lovely…' : 'Connect to the game to send…'} rows={2} maxLength={500} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendMessage(); } }} /><button className="send-button" type="submit" disabled={!canSend || sending || !draft.trim() || byteLength > 500} aria-label="Send message"><Icon name="send" size={20} /></button></div><div className="composer-footer"><span>{demo ? 'Simulated send' : 'Enter to send · single line'}</span><span className={byteLength > 500 ? 'over-limit' : ''}>{draft ? byteLength : 0}/500 bytes{sending ? ' · Sending…' : ''}</span></div></form> : <div className="activity-footer"><Icon name="paw" size={16} /><span>{view === 'activity' ? 'Open a conversation to reply without going back to the game.' : 'This channel is read-only.'}</span><span className="footer-heart" aria-hidden="true">♡</span></div>}
      </main>
      <aside className="right-panel" aria-label="Players targeting you">
        <div className="watching-heading"><span className="circle-icon"><Icon name="eye" /></span><h2>Eyes on you</h2><span className="watcher-count">{watchers.length}</span></div>
        <p className="right-description">Targeting you right now</p>
        {watchers.length ? watchers.map(watcher => <div className="watcher" key={watcher.name + watcher.world}><span className="avatar lilac">{initials(watcher.name)}</span><div><strong>{watcher.name}</strong><small>{watcher.world} · {watcher.distance} yalms</small><button onClick={() => openConversation(`${watcher.name}@${watcher.world}`)}>Send a private message <span aria-hidden="true">↗</span></button></div></div>) : <div className="no-watchers"><Icon name="eye" size={29} /><p>{connection !== 'live' ? 'Waiting for the connection' : !player.targetTracking && player.online ? 'Detection paused' : 'All quiet here'}</p></div>}
        <section className="recent-watchers" aria-label="Recent glances">
          <h3>Looked at you recently <span>{pastWatchers.length}</span></h3>
          <p className="right-description">Last 30 minutes · most recent first</p>
          {pastWatchers.length ? pastWatchers.map(watcher => <button className="person-item recent-person" key={`${watcher.name}@${watcher.world}`} title={`Open conversation with ${watcher.name}`} onClick={() => openConversation(`${watcher.name}@${watcher.world}`)}><span className="avatar lilac">{initials(watcher.name)}</span><span className="person-name">{watcher.name}<small>{watcher.world}</small></span><time dateTime={watcher.lastSeen} title={new Date(watcher.lastSeen).toLocaleTimeString('en-GB')}>{lastSeenLabel(watcher.lastSeen)}</time></button>) : <p className="recent-empty">No recent glances yet.</p>}
        </section>
        <label className="toggle-row glance-desktop"><span>Desktop alerts for glances</span><input type="checkbox" checked={preferences.targetDesktop} onChange={e => setPreferences(old => ({ ...old, targetDesktop: e.target.checked }))} /></label>
        <p className="glance-notice">{!preferences.targetDesktop ? 'Desktop alerts for glances are off. History stays visible.' : !preferences.desktop || !preferences.target ? 'Enable desktop notifications and target alerts in settings to receive these alerts.' : 'Desktop alerts follow your browser permission and focus settings.'} <button onClick={() => setSettings(true)}>Alert settings</button></p>
        <div className="right-divider" />
        <div className="little-note"><span aria-hidden="true">✧</span><h3>Never miss a hello</h3><p>Turn alerts on and carry on. Elfie watches the mailbox.</p><button onClick={() => setSettings(true)}>Adjust my alerts <Icon name="settings" size={16} /></button></div>
        <div className="location-card"><span className="location-star" aria-hidden="true">✦</span><span>WHERE YOU ARE<strong>{player.zone || 'Eorzea awaits'}</strong></span></div>
        <div className="right-footnote">Only characters your game already receives. Glances pause in PvP.</div>
      </aside>
    </div>
    <dialog ref={newChatDialog} onCancel={() => setNewChat(false)} onClick={e => { if (e.target === newChatDialog.current) setNewChat(false); }}><form onSubmit={e => { e.preventDefault(); const identity = recipient.trim(); if (/^[A-Za-z'-]{2,15} [A-Za-z'-]{2,15}@[A-Za-z][A-Za-z0-9-]{1,31}$/.test(identity)) { openConversation(identity); setNewChat(false); } }}><div className="modal-heading"><span className="circle-icon pink"><Icon name="mail" /></span><h2>A new private message</h2><button className="icon-button" type="button" aria-label="Close" onClick={() => setNewChat(false)}><Icon name="close" /></button></div><label className="field-label" htmlFor="recipient">Full name and world</label><input id="recipient" autoFocus value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Luna Moonpetal@Moogle" required pattern="[A-Za-z'\-]{2,15} [A-Za-z'\-]{2,15}@[A-Za-z][A-Za-z0-9\-]{1,31}" /><p className="modal-note">Include the home world, even when you share a server.</p><button className="primary-button" type="submit">Open conversation <Icon name="mail" size={18} /></button></form></dialog>
    <dialog ref={settingsDialog} onCancel={() => setSettings(false)} onClick={e => { if (e.target === settingsDialog.current) setSettings(false); }}><div className="modal-heading"><span className="circle-icon pink"><Icon name="bell" /></span><h2>Alerts your way</h2><button className="icon-button" aria-label="Close settings" onClick={() => setSettings(false)}><Icon name="close" /></button></div><button className="primary-button enable-alerts" onClick={enableAlerts}>Turn on sound and permissions <Icon name="bell" size={18} /></button><p className="modal-note">Keep this tab open. If the browser suspends it, alerts can arrive late.</p><div className="notification-volume"><label htmlFor="notification-volume">Notification volume <output htmlFor="notification-volume">{preferences.volume}%</output></label><input id="notification-volume" type="range" min="0" max="100" step="1" value={preferences.volume} aria-valuetext={preferences.volume === 0 ? 'Muted' : `${preferences.volume}%`} onChange={e => setPreferences(old => ({ ...old, volume: Number(e.target.value) }))} /><div className="volume-scale"><span>Muted</span><span>Maximum</span></div></div>{([['sound', 'Gentle sound'], ['desktop', 'Desktop notifications'], ['tell', 'When someone writes privately'], ['emote', 'Emotes aimed at me'], ['target', 'When someone targets me'], ['targetDesktop', 'Desktop alerts for glances'], ['mention', 'Mentions of my name'], ['whileVisible', 'Alert me even while I am watching the panel']] as [TogglePreference, string][]).map(([id, label]) => <label className="toggle-row" key={id}><span>{label}</span><input type="checkbox" checked={preferences[id]} onChange={e => setPreferences(old => ({ ...old, [id]: e.target.checked }))} /></label>)}<section className="channel-notices"><h3>Alerts by channel</h3><p className="modal-note">Muted: still shown in the history, but it adds no unread count and triggers no sound or notification. Emotes aimed at you are set above.</p>{Object.keys(channelDefaults).map(channel => <label className="channel-notice-row" key={channel}><span>{channel === 'emote' ? 'Emotes near me' : channelNames[channel]}</span><select aria-label={`Alerts for ${channel === 'emote' ? 'emotes near me' : channelNames[channel]}`} value={preferences.channels[channel]} onChange={e => { const mode = e.target.value as ChannelMode; setPreferences(old => ({ ...old, channels: { ...old.channels, [channel]: mode } })); }}><option value="mute">Muted</option><option value="mentions">Mentions only</option><option value="all">Everything</option></select></label>)}</section><p className="modal-note">Auto-open and mention nicknames are set in <strong>/elfie config</strong>.</p><p className="modal-note">Messages live in memory for this session only. Emotes without a chat line never appear.</p><button className="soft-button" onClick={() => { chime(); setNotice(audio.current?.state === 'running' ? 'Test sound played.' : 'Press Turn on alerts to enable sound.'); }}>Test sound</button></dialog>
  </div>;
}
