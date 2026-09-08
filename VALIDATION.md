# Verification

This file records only checks that were actually run. A successful build does not replace testing inside FFXIV.

## Reference environment

- Linux, XIVLauncher in `~/.xlcore`.
- Dalamud installed: `15.0.3.2`, API 15, .NET 10 runtime.
- Game version reported by Dalamud: `2026.08.11.0000.0000`.
- Chat signatures, the recipient relationship and native chat input were checked against official documentation/code and local references.

## Status

- [x] Source for the integration, core, server and frontend written.
- [x] Original mascot generated and inspected.
- [x] Node script and Bash script syntax checked; the three XML projects, the JSON manifest and the Python script parse correctly.
- [x] Web dependencies downloaded and frontend prepared.
- [x] TypeScript and web build completed.
- [x] Behavior tests in `tests/` run: **36 tests passed**, recorded in `setup-linux.log`.
- [x] DLL compiled against the installed Dalamud: **0 errors and 0 warnings**. The `territory` field uses `uint`, matching `Client.TerritoryType` in API 15.
- [x] ZIP package generated and checked: integrity correct and web files present.
- [x] DLL and core copied to `~/.xlcore/devPlugins/ElfiesPawpost/`; their contents match the package.
- [ ] Plugin loaded inside FFXIV.
- [ ] Real round-trip private message validated by the user.
- [ ] Real emote towards the character and another player's target verified.
- [ ] Native browser opened from Wine and alerts checked with the game minimized.

Update of 6 September 2026: build and test checks were cross-referenced with the setup log and existing artifacts; they were not repeated while updating documentation. The saved Dalamud configuration has an empty `DevPluginLoadLocations`. The file copy is confirmed, but registering the DLL in the interface and checking that it loads is still pending. No running game's configuration was edited.

## Testing inside the game

1. Load the DLL as a Dev Plugin and run `/elfie`.
2. Turn on alerts in the browser. Open another application and receive a private message from someone you know.
3. Verify name and world, reply manually and check reception on the other client.
4. Receive a standard emote aimed at the character and another aimed at someone else; only the first should appear as aimed at you.
5. Ask someone to target the character, hold the target, drop it and target again; check the list and the cooldown.
6. Log out of the character: the panel should go to waiting, clear the history and block sending. Log in with another character: history must not mix.
7. Stop/restart the plugin: the old link must stop granting access; `/elfie` must provide the new one.

No real test messages are sent automatically. The user controls every send.

The optional WebMCP integration only stages a visible draft, without sending it. It has not been validated in a compatible browser.

## Alerts by channel

A shared policy for sound, notifications and unread counts was added. Eight automated cases cover muted channels, mentions, all messages, directed versus ambient emotes, own messages, independent channels and settings migration. TypeScript and the web build were checked. It does not require changing the DLLs; update the web folder and reload the browser.

System is muted by default, error events included: it no longer goes through the mentions switch. Activity is ordered by descending ID and updated through the existing stream. Conversations keep their chronological order. Eleven policy/activity tests passed, covering new arrivals, the original history order and the retention of muted messages under Everything.

## Panel layout and English interface

- The page is a fixed-height flex column: `.pawpost` fills `100dvh`, the workspace takes the remaining space with `min-height:0`, and the sidebar, main panel and right panel each scroll on their own. The former `calc(100dvh - 96px)` / `- 131px` / `- 78px` / `- 122px` arithmetic and the `min-height:580px` floor are gone, so a wrapping header or the preview banner no longer pushes the panel past the viewport and makes the whole document scroll.
- `.main-panel` gained `min-height:0` and `overflow:hidden`, so the timeline is the only scroller in the conversation column. The timeline now lives in a `.timeline-wrap` positioned container, which anchors the "new items" pill to the scroller instead of a guessed `bottom:170px`.
- The pinned edge follows the view: Activity pins to the top (newest first), a conversation pins to the bottom. Reading away from that edge no longer moves the scroll; the pill reads "New notices ↑" or "New messages ↓" and jumps back on click.
- Every user-facing string is English: panel, dialogs, demo data, `en-GB` time and date formats, plugin chat output and ImGui settings, core validation errors, HTTP error bodies, the plugin manifest, `index.html` (`lang="en"`) and the build/update scripts.
- Checked after the change: 11 Node policy tests, `tsc --noEmit`, the Vite build, the 36 core/HTTP tests and the packaging step. Behavior inside FFXIV is still pending as listed above.

## Own messages never alert

The panel policy already stopped at `event.outgoing`, so the leak was upstream: `Plugin.OnChat` marked a line outgoing only from `XivChatType.TellOutgoing` or `SourceKind == LocalPlayer`. A line you sent that arrives without that relation — a same-world channel line with no World payload — stayed incoming, and if it contained your own name or a nickname it became a mention and alerted.

The decision moved into `ChatRules.IsOwnMessage`, free of Dalamud types and covered by tests: an outgoing tell (whose sender field holds the recipient), a line the game attributes to the local player, or a line whose sender is your own character, including when the World payload is missing. An emote whose target is the local player is never treated as own, so directed emotes still alert.

Checked after the change: 12 Node policy tests, including one asserting nothing outgoing alerts on any channel or filter while it stays visible under Everything; 44 core/HTTP tests; `tsc --noEmit`; the Vite build; packaging. This fix lives in the DLL, so updating only the web folder does not apply it.


## Instance changes and default dark theme (7 September 2026)

- A temporarily unavailable local player no longer resets the character session.
  Automatic opening happens once per character login; the explicit Dalamud Logout
  event clears the session and its history. A different character still resets
  history. Loading pauses player/target availability without reopening the panel.
- Added regression coverage for repeated loading gaps, character changes, and a
  genuine logout followed by login with the same character: 59 core/HTTP checks
  and 12 notification-policy tests pass. Plugin compilation has no warnings or
  errors; TypeScript and the static production build pass.
- Dark mode is the default, including the initial HTML before React loads.
  The header toggle persists the light/dark choice. Checked both themes, the
  settings dialog, reload persistence, and desktop/mobile layouts at 1440, 390,
  and 360 pixels using fictional demo data; no page errors or horizontal overflow.
- The instance transition fix still needs confirmation inside FFXIV after reloading
  the updated plugin. Automated session tests do not simulate the running game.


## Recent glances and desktop delivery (7 September 2026)

- Snapshots include recent target observations independently of the notification
  cooldown and chat-event retention. Last-seen timestamps update while targeting
  continues. Entries are deduplicated by name/home world, ordered most recent
  first, limited to 100, and expire after 30 minutes. Session clearing erases them.
  Player history remains in plugin memory only.
- Eyes on you separates current targets from recent visitors and updates relative
  times while the page stays open. Either group can open a private conversation.
- A persistent desktop-only glance switch leaves history, sound/unread policy,
  and private-message desktop delivery unchanged. Existing preferences migrate
  without silently enabling global desktop notifications.
- 67 core/HTTP checks and 14 notification-policy tests pass; TypeScript and plugin
  compilation pass without errors or warnings. Browser checks using fictional
  data cover recent visitors, advancing relative time, toggle persistence,
  conversation opening, and both themes.
- Real target detection and desktop delivery still need in-game confirmation
  after reloading the plugin and granting browser notification permission.


## Closing conversations and compact recent visitors

- Private conversations have separate, keyboard-accessible close buttons in the
  sidebar and conversation header. Closing removes the row and its unread badge;
  closing the active conversation returns to Activity. History and drafts remain
  in memory, and opening the contact manually restores the conversation.
- New incoming private messages reopen a closed row. Replayed history and outgoing
  messages do not reopen it. Closed-row state resets with the character session.
- Recent visitors use compact clickable rows with avatar, name, world, and elapsed
  time. Long names truncate visually with a full-name tooltip.
- TypeScript and production build pass. Browser checks with fictional data cover
  closing active/inactive conversations, the mobile header close button, preserved
  drafts, manual reopening, and incoming versus outgoing stream updates.


## Notification volume

- Volume defaults to 50%, persists in browser preferences, and controls the chime
  gain. Zero volume skips audio playback. Stored values are validated and clamped.
- All 15 notification-policy tests pass, including volume defaults, existing-user
  migration, limits, and invalid values. TypeScript and the production build pass.
- Browser checks confirmed the default, slider interaction, saved value after
  reload, and the muted label. The settings layout was visually inspected.
