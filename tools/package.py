"""Package only Pawpost binaries and its static UI, never Dalamud/game binaries."""
from pathlib import Path
import shutil
import zipfile

root = Path(__file__).resolve().parent.parent
build = root / 'plugin/bin/Release/net10.0-windows'
destination = root / 'dist/ElfiesPawpost'
destination.mkdir(parents=True, exist_ok=True)
for name in ('ElfiesPawpost.dll', 'ElfiesPawpost.Core.dll', 'ElfiesPawpost.json', 'ElfiesPawpost.deps.json'):
    source = build / name
    if not source.is_file():
        raise SystemExit(f'Missing build artifact: {source}')
    shutil.copy2(source, destination / name)
if not (root / 'web/dist/index.html').is_file():
    raise SystemExit('Missing static web build')
# Package in a fresh staging tree so old hashed JS cannot leak into new releases.
import tempfile
with tempfile.TemporaryDirectory(prefix='elfie-package-') as temp:
    staged_web = Path(temp) / 'web'
    shutil.copytree(root / 'web/dist', staged_web)
    # Destination is project-owned generated output only.
    if (destination / 'web').exists():
        shutil.rmtree(destination / 'web')
    shutil.copytree(staged_web, destination / 'web')
shutil.copy2(root / 'README.md', destination / 'README.md')
archive = root / 'dist/ElfiesPawpost-0.1.0.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as out:
    for file in sorted(destination.rglob('*')):
        if file.is_file():
            out.write(file, file.relative_to(destination.parent))
print(f'Package ready: {archive}')
