"""Update only the static panel of the existing local dev-plugin installation."""
from pathlib import Path
import shutil
root = Path(__file__).resolve().parent.parent
source = root / 'dist/ElfiesPawpost/web'
installed = Path.home() / '.xlcore/devPlugins/ElfiesPawpost'
if not (source / 'index.html').is_file() or not (installed / 'ElfiesPawpost.dll').is_file():
    raise SystemExit('Could not find the built panel or the Elfie’s Pawpost installation.')
shutil.copytree(source, installed / 'web', dirs_exist_ok=True)
print('Installed panel updated. Reload the browser tab; no FFXIV restart needed.')
