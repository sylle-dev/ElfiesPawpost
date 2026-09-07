import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
await mkdir(path.join(web, 'pawpost'), { recursive: true });
await mkdir(path.join(web, 'public'), { recursive: true });
for (const file of ['Pawpost.tsx', 'pawpost.css', 'reset.css', 'notification-policy.mjs', 'notification-policy.d.mts'])
  await copyFile(path.join(root, 'frontend', file), path.join(web, 'pawpost', file));
await copyFile(path.join(root, 'assets', 'elfie-courier.png'), path.join(web, 'public', 'elfie-courier.png'));
await writeFile(path.join(web, 'pawpost', 'main.tsx'), `import { createRoot } from 'react-dom/client';\nimport Pawpost from './Pawpost';\ncreateRoot(document.getElementById('root')!).render(<Pawpost />);\n`);
await writeFile(path.join(web, 'index.html'), `<!doctype html>
<html lang="en" data-theme="dark"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="theme-color" content="#19161f"/><meta name="description" content="Elfie's local Eorzea mailbox."/><script>try{document.documentElement.dataset.theme=localStorage.getItem('elfie.theme')==='light'?'light':'dark'}catch{}</script><title>Elfie's Pawpost</title><link rel="icon" type="image/svg+xml" href="/favicon.svg"/></head><body><div id="root"></div><script type="module" src="/pawpost/main.tsx"></script></body></html>`);
await writeFile(path.join(web, 'public', 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#f6dce7"/><g fill="#934967"><ellipse cx="20" cy="25" rx="9" ry="7"/><ellipse cx="9" cy="16" rx="3" ry="4"/><ellipse cx="16" cy="11" rx="3" ry="4"/><ellipse cx="24" cy="11" rx="3" ry="4"/><ellipse cx="31" cy="16" rx="3" ry="4"/></g></svg>`);
await writeFile(path.join(web, 'vite.pawpost.config.ts'), `import { defineConfig } from 'vite';
// A Dalamud plugin embeds static files. No Cloudflare/server runtime is shipped to the game.
export default defineConfig({ esbuild: { jsx: 'automatic' }, build: { outDir: 'dist', emptyOutDir: true }, server: { host: '127.0.0.1', port: 17424, strictPort: true } });\n`);
const packageFile = path.join(web, 'package.json');
const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
pkg.name = 'elfies-pawpost-web';
pkg.scripts = { ...pkg.scripts, 'pawpost:dev': 'vite --config vite.pawpost.config.ts', 'pawpost:build': 'vite build --config vite.pawpost.config.ts', 'pawpost:check': 'tsc --noEmit -p tsconfig.pawpost.json' };
await writeFile(packageFile, JSON.stringify(pkg, null, 2) + '\n');
await writeFile(path.join(web, 'tsconfig.pawpost.json'), JSON.stringify({ compilerOptions: { target: 'ES2023', lib: ['ES2023', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true, types: ['vite/client'] }, include: ['pawpost/**/*.tsx'] }, null, 2) + '\n');
console.log('Pawpost frontend prepared.');
