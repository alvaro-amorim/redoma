import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('browser imports, entry point and DOM bindings exist', async () => {
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const imports=JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;
  const paths=new Set(['./app.js','./styles.css',...Object.values(imports).filter(p=>!p.endsWith('/'))]);
  for(const path of paths) assert.ok((await readFile(new URL('../public/'+path,import.meta.url))).length>0);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const match of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]),'Missing DOM id: '+match[1]);
  for(const match of app.matchAll(/from '(\.[^']+)'/g)) assert.ok((await readFile(new URL('../public/'+match[1],import.meta.url))).length>0);
  const THREE=await import('../public/vendor/three.module.js');
  for(const name of ['WebGLRenderer','Mesh','CanvasTexture','MeshPhysicalMaterial']) assert.equal(typeof THREE[name],'function');
});
test('static server serves HTML, CSS and ES modules', {timeout:10000}, async () => {
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit');
  try {
    const [message]=await once(child.stdout,'data');
    const port=message.toString().match(/localhost:(\d+)/)[1];
    for(const path of ['/','/styles.css','/app.js','/physics.js','/vendor/rapier.mjs']) {
      const response=await fetch('http://127.0.0.1:'+port+path);
      assert.equal(response.status,200,path);
      assert.ok((await response.arrayBuffer()).byteLength>0);
    }
    assert.equal((await fetch('http://127.0.0.1:'+port+'/missing')).status,404);
    assert.equal((await fetch('http://127.0.0.1:'+port+'/',{method:'POST'})).status,405);
  } finally {child.kill();await exited;}
});
