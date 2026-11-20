import { readdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}/${e.name}`) : `${dir}/${e.name}`));
  return nested.flat();
}
const paths = (await files('dist')).filter(path => !path.endsWith('/sw.js'));
const hash = createHash('sha256');
for (const path of paths) hash.update(await readFile(path));
const version = hash.digest('hex').slice(0, 12);
const urls = ['/', ...paths.map(path => path.slice(4))];
await writeFile('dist/sw.js', `const CACHE = 'pocket-time-${version}';
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('pocket-time-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    // Assets are same-origin and identical for every request. Dev/preview servers
    // may emit Vary: Origin, unlike the requests used by cache.addAll.
    const hit = await cache.match(event.request, { ignoreVary: true });
    if (hit) return hit;
    try { return await fetch(event.request); }
    catch (error) { if (event.request.mode === 'navigate') return cache.match('/'); throw error; }
  }));
});
`);
