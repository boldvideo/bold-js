// Bundle an exact npm release, never the checkout's src/ or dist/.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const version = process.argv[2] ?? '2.1.0';
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Pass an exact stable npm version');
const root = mkdtempSync(join(tmpdir(), 'bold-voice-'));
const site = join(root, 'site');
mkdirSync(site);
execFileSync('npm', ['install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund',
  '--save-exact', `@boldvideo/bold-js@${version}`], { stdio: 'inherit' });
const pkg = JSON.parse(readFileSync(join(root, 'node_modules/@boldvideo/bold-js/package.json'), 'utf8'));
if (pkg.version !== version) throw new Error('Installed version differs from requested version');
const require = createRequire(import.meta.url);
const { buildSync } = require(require.resolve('esbuild', { paths: [require.resolve('tsup')] }));
buildSync({
  entryPoints: [join(root, 'node_modules/@boldvideo/bold-js', pkg.module)],
  outfile: join(site, 'sdk.js'), bundle: true, platform: 'browser', format: 'esm', target: 'es2020',
});
for (const file of ['index.html', 'harness.js', 'loopback.js']) {
  copyFileSync(new URL(file, import.meta.url), join(site, file));
}
writeFileSync(join(site, 'version.json'), JSON.stringify({ package: pkg.name, version }));
console.log(`Prepared ${pkg.name}@${version}\nServe only: ${site}\nDelete after testing: ${root}`);
