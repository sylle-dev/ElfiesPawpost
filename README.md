# Elfie's Pawpost 🐾

A local mailbox for staying in touch with Eorzea while you do other things. Clear pastel interface, an original catgirl courier, and one conversation per person.

## What it includes

- Web panel opened with **`/elfie`** from the game.
- Optional opening once when you log in with a character: **`/elfie auto on`**. Loading screens and instance changes do not reopen the browser.
- Dark mode by default. Use the sun/moon button in the header to switch themes; your choice is saved in this browser.
- Private messages per person, with home world, and writing to Say, Party, FC, Alliance, Shout, Yell, LS and CWLS.
- Activity by channel, mentions of your full name or nicknames, unread messages and game errors.
- Emotes aimed at your character, using `TargetKind.LocalPlayer` from Dalamud API 15; ambient emotes kept separate.
- List of nearby players who have you as their **normal target**, with distance and a button to start a private message. It does not detect another person's Focus Target. It pauses in PvP.
- Alerts by channel: **Muted**, **Mentions only** or **Everything**, under Settings → Alerts by channel. System, Say, Shout, Yell and nearby emotes are muted by default. Activity shows the newest first and updates live; For you respects muted channels. Muting avoids sound, notifications and unread counters while keeping the history. Emotes aimed at you, private messages and glances have their own switches.
- Sound and browser notifications, configurable. Press **Turn on alerts** once; keep the tab open.
- Automatic reconnection, without duplicating history or re-alerting the whole backlog when the tab opens.
- The panel fills the window and never scrolls the page: each column scrolls on its own, the conversation stays pinned to its newest message, and Activity stays pinned to the top. When new items arrive while you are reading further away, a pill offers to jump back to the live edge instead of moving you.

The interface is in English.

## Installing the built package

The build produces `dist/ElfiesPawpost/`, and also `dist/ElfiesPawpost-0.1.0.zip`. Neither is tracked in the repository; run `tools/build.sh` to create them. The last build passed 44 core/HTTP tests and 12 panel tests, and compiled with no errors or warnings. See `VALIDATION.md` to tell the checks that ran apart from the tests still pending inside the game.

Copying the folder into `~/.xlcore/devPlugins/ElfiesPawpost/` is not enough on its own: Dalamud also needs the path registered under its dev plugin locations, and it addresses Linux paths through the Wine `Z:` drive. For a user named `you`, that path reads:

```text
Z:\home\you\.xlcore\devPlugins\ElfiesPawpost\ElfiesPawpost.dll
```

Then enable it under Dev Tools and check `/elfie`. Restarting the whole game is not the first step: register the location and use the dev plugin load/reload controls.

1. Keep the whole folder together: `ElfiesPawpost.dll`, `ElfiesPawpost.Core.dll`, the manifest and **`web/`**.
2. In game open **`/xlsettings` → Experimental → Dev Plugin Locations**. Add the path to `ElfiesPawpost.dll`.
3. Under **`/xlplugins` → Dev Tools / Installed Dev Plugins**, enable **Elfie's Pawpost**.
4. Type **`/elfie`**. The panel is now usable in your browser.
5. Press **Turn on alerts** and grant notifications if you want them.

You can also point Dalamud straight at the build output instead of copying it. On Linux/Wine that path reads:

```text
Z:\home\you\path\to\ElfiesPawpost\dist\ElfiesPawpost\ElfiesPawpost.dll
```

If Wine does not open the native browser, use **`/elfie config` → Copy private link** and paste it into your Linux browser. The base address is `http://127.0.0.1:17423`; the full link includes a temporary key. The server runs inside the game process and closes when the plugin unloads or the game exits.

## Commands

| Command | Action |
| --- | --- |
| `/elfie` | Starts the server if needed and opens the panel. |
| `/elfie config` | Settings for opening, detection, nicknames and port. |
| `/elfie auto on` / `/elfie auto off` | Enables/disables opening the browser when you log in with a character. |
| `/elfie start` | Starts the server without opening a browser. |
| `/elfie stop` | Stops the server. |
| `/elfie clear` | Clears the session history. |

The server starts when the plugin loads. Opening the browser is disabled by default. No internet server, extra account, or plugin installed by your friends is required.

## Building on Linux

Requires **.NET SDK 10**, Node/npm, Python 3 and a **Dalamud API 15** installation. The installation detected while preparing the project was `15.0.3.2`, for FFXIV `2026.08.11.0000.0000`.

Automatic preparation from your Linux terminal, without `sudo`:

```bash
bash tools/setup-linux.sh
```

It downloads the official SDK into `.tools/`, prepares the web dependencies and tries to build and test the project. It saves the result in `setup-linux.log` so you can review any failure. It does not install or enable the plugin in FFXIV. The equivalent manual steps are described below.

First preparation of the interface, if `web/package.json` does not exist yet:

```bash
cd web
npm create --yes @openai/sites@0.3.0 . -- --yes --add-ons shadcn --install
cd ..
```

If the web project already exists, install its lockfile with `npm --prefix web ci`. The Sites scaffold provides the React/Vite dependencies; the panel is built as static files served from Dalamud, without publishing data outside the computer.

If a local SDK is needed, the official .NET installer works with `--channel 10.0 --install-dir "$PWD/.tools/dotnet" --no-path`. `tools/build.sh` also accepts a system-installed SDK through `ELFIE_DOTNET`.

```bash
DALAMUD_HOME="$HOME/.xlcore/dalamud/Hooks/15.0.3.2" bash tools/build.sh
```

The script prepares the frontend, checks TypeScript, builds the web panel, runs the core/HTTP tests, compiles the plugin and creates the ZIP. Only our own files are distributed: the Dalamud and game DLLs are referenced from your installation.

To see the design without the game:

```bash
node tools/prepare-web.mjs
npm --prefix web run pawpost:dev
```

Open `http://127.0.0.1:17424/?demo=1`. The header clearly says **Preview mode**; its messages are fictional and nothing is sent to FFXIV. Without `?demo=1`, the panel waits for a real connection.

## Limits of this version

- Emotes without a chat line are not captured. Custom emotes may not have a real recipient; mentions by name are distinguished from the game's own recipient detection.
- The target only exists for objects the client has loaded; there can be delays if the game heavily limits background FPS. It does not identify camera glances or inspections.
- Up to 1500 events are kept **in memory only**. History clears when you log out, switch character or reload the plugin. Nicknames and settings are stored in Dalamud; alert settings, in the browser. This plugin does not write chat text to disk.
- Item links and auto-translate phrases are shown as text; they are not interactive game links.
- The server only listens on `127.0.0.1`. The key changes when the server restarts. Do not share the link or expose it to the internet.
- A send confirmed by the panel means **delivered to the game's chat input**, not read or received by the other person. Normal FFXIV restrictions, offline recipients and errors still apply; they are shown in Activity.
- Notifications require an open tab and browser permission. A suspended tab, a sleeping computer or the system Do Not Disturb mode can prevent immediate alerts.
- FFXIV/Dalamud changes may require recompiling or adapting the plugin. The native sending path must be verified inside the game before this version counts as validated in real use.

## Structure

- `plugin/`: Dalamud integration, commands and settings.
- `core/`: local server, message validation, history and target alert control.
- `frontend/`: canonical interface source, copied by `tools/prepare-web.mjs` into `web/pawpost/`.
- `web/`: npm scaffold. Only `package.json` and `package-lock.json` are tracked; everything else is regenerated by `npm --prefix web ci` and `tools/prepare-web.mjs`.
- `tests/`: behavior tests for the core and the real server, without depending on FFXIV.
- `assets/`: original mascot and generation prompt.
- `tools/`: preparation, build and packaging.

## Technical references

- [Dalamud chat API](https://dalamud.dev/api/Dalamud.Plugin.Services/Interfaces/IChatGui/)
- [Dalamud message model](https://github.com/goatcorp/Dalamud/blob/master/Dalamud/Game/Chat/ChatMessage.cs)
- [Official SamplePlugin](https://github.com/goatcorp/SamplePlugin)
- [FFXIVClientStructs: UIModule](https://github.com/aers/FFXIVClientStructs/blob/main/FFXIVClientStructs/FFXIV/Client/UI/UIModule.cs)

Own implementation; no code was copied from Peeping Tom, Messenger or ChatAnywhere.

## Repository contents

Source only. `dist/`, `.tools/`, `setup-linux.log`, every `bin/`/`obj/`, and the whole of `web/` except its two dependency manifests are ignored: they are build output or downloaded toolchain, and they carry absolute paths from the machine that produced them. A clone rebuilds all of it:

```bash
npm --prefix web ci
DALAMUD_HOME="$HOME/.xlcore/dalamud/Hooks/<version>" bash tools/build.sh
```

The plugin holds no credentials. The API token is generated in memory at every server start (`RandomNumberGenerator` in `core/LocalServer.cs`), never written to disk and never committed.
