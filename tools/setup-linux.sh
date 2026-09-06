#!/usr/bin/env bash
# Run from the user's Linux terminal when Codex's permission dialog is unavailable.
# Installs build tools locally; does not modify FFXIV or install the plugin into the game.
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
mkdir -p "$project_root/.tools" "$project_root/web"
exec > >(tee "$project_root/setup-linux.log") 2>&1
trap 'printf "\nLa preparación se ha detenido. Codex puede revisar setup-linux.log y continuar desde aquí.\n" >&2' ERR

for executable in curl node npm python3; do
    if ! command -v "$executable" >/dev/null 2>&1; then
        printf 'Falta %s en el sistema. No se ha instalado nada con sudo.\n' "$executable" >&2
        exit 1
    fi
done

export DOTNET_CLI_HOME="$project_root/.tools/dotnet-home"
export NUGET_PACKAGES="$project_root/.tools/nuget"
export DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export npm_config_cache="$project_root/.tools/npm-cache"

printf '\n[1/4] Preparando .NET SDK 10 para Linux dentro del proyecto…\n'
if [[ ! -x "$project_root/.tools/dotnet/dotnet" ]]; then
    curl --fail --location --retry 2 --connect-timeout 20 \
        https://dot.net/v1/dotnet-install.sh -o "$project_root/.tools/dotnet-install.sh"
    bash "$project_root/.tools/dotnet-install.sh" --channel 10.0 \
        --install-dir "$project_root/.tools/dotnet" --no-path
fi
export ELFIE_DOTNET="$project_root/.tools/dotnet/dotnet"
"$ELFIE_DOTNET" --version

printf '\n[2/4] Preparando las dependencias de la interfaz…\n'
if [[ ! -f "$project_root/web/package.json" ]]; then
    (
        cd "$project_root/web"
        npm create --yes @openai/sites@0.3.0 . -- --yes --add-ons shadcn --install
    )
elif [[ -f "$project_root/web/package-lock.json" ]]; then
    npm --prefix "$project_root/web" ci
else
    npm --prefix "$project_root/web" install
fi

printf '\n[3/4] Localizando Dalamud…\n'
if [[ -z "${DALAMUD_HOME:-}" ]]; then
    if [[ -f "$HOME/.xlcore/dalamud/Hooks/15.0.3.2/Dalamud.dll" ]]; then
        export DALAMUD_HOME="$HOME/.xlcore/dalamud/Hooks/15.0.3.2"
    else
        export DALAMUD_HOME="$HOME/.xlcore/dalamud/Hooks/dev"
    fi
fi
if [[ ! -f "$DALAMUD_HOME/Dalamud.dll" ]]; then
    printf 'No encuentro Dalamud API 15. Indica la carpeta con DALAMUD_HOME.\n' >&2
    exit 1
fi
printf 'Referencias: %s\n' "$DALAMUD_HOME"

printf '\n[4/4] Compilando y ejecutando las pruebas…\n'
bash "$project_root/tools/build.sh"
printf '\nPreparación terminada. Paquete: %s/dist/ElfiesPawpost-0.1.0.zip\n' "$project_root"
printf 'No se ha cargado nada en el juego ni se han enviado mensajes.\n'
