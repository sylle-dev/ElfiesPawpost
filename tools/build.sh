#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
export DOTNET_CLI_HOME="$project_root/.tools/dotnet-home"
export NUGET_PACKAGES="$project_root/.tools/nuget"
export DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
export DOTNET_CLI_TELEMETRY_OPTOUT=1
dotnet_exe="${ELFIE_DOTNET:-$project_root/.tools/dotnet/dotnet}"
if [[ ! -x "$dotnet_exe" ]]; then dotnet_exe="$(command -v dotnet || true)"; fi
if [[ -z "$dotnet_exe" ]]; then echo 'Missing .NET SDK 10. See README.md.' >&2; exit 1; fi
dalamud_path="${DALAMUD_HOME:-$HOME/.xlcore/dalamud/Hooks/dev}"
if [[ ! -f "$dalamud_path/Dalamud.dll" ]]; then echo 'Set DALAMUD_HOME to the Dalamud API 15 folder.' >&2; exit 1; fi
if [[ ! -f web/package.json ]]; then echo 'Web dependencies are not prepared. See README.md.' >&2; exit 1; fi
node --test tests/notification-policy.test.mjs
node tools/prepare-web.mjs
npm --prefix web run pawpost:check
npm --prefix web run pawpost:build
"$dotnet_exe" run --project tests/ElfiesPawpost.Tests.csproj -c Release
"$dotnet_exe" build plugin/ElfiesPawpost.csproj -c Release -p:FWLinkGeneration=false "-p:DalamudLibPath=$dalamud_path"
python3 tools/package.py
