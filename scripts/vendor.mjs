import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
async function packageRoot(name) {
  let directory = dirname(require.resolve(name));
  for (;;) {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (metadata.name === name) return directory;
    } catch {}
    const parent = dirname(directory);
    if (parent === directory) throw new Error('Package root missing: ' + name);
    directory = parent;
  }
}
const out = resolve('public/vendor');
await mkdir(out, { recursive: true });
const three = await packageRoot('three');
const rapier = await packageRoot('@dimforge/rapier3d-compat');
for (const [root, source, target] of [
  [three, 'build/three.module.js', 'three.module.js'],
  [three, 'build/three.core.js', 'three.core.js'],
  [three, 'examples/jsm/controls/OrbitControls.js', 'OrbitControls.js'],
  [three, 'examples/jsm/environments/RoomEnvironment.js', 'RoomEnvironment.js'],
  [three, 'LICENSE', 'THREE-LICENSE.txt'],
  [rapier, 'rapier.mjs', 'rapier.mjs'],
  [rapier, 'LICENSE', 'RAPIER-LICENSE.txt']
]) {
  try { await copyFile(join(root, source), join(out, target)); }
  catch (error) {
    // Rapier distributions may put entry points inside dist/.
    if (source === 'rapier.mjs') await copyFile(join(root, 'dist', source), join(out, target));
    else throw error;
  }
}
console.log('Three.js and Rapier copied to public/vendor.');
