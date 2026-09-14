// Generated per build. A complete cached release activates atomically.
const CACHE_PREFIX = `fiction-engine:${self.registration.scope}:`;
const REVISION = '__REVISION__';
const APP_CACHE = `${CACHE_PREFIX}app-v${REVISION}`;
const APP_SHELL = __ASSETS__;
self.addEventListener('install', event => {
    event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL.map(url => new Request(url,{cache:'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const old = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== APP_CACHE);
        await Promise.all(old.map(name => caches.delete(name)));
        await self.clients.claim();
        if (old.length) for (const client of await self.clients.matchAll({type:'window'})) {
            if (client.url.startsWith(self.registration.scope)) client.navigate(client.url).catch(() => {});
        }
    })());
});
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
    event.respondWith((async () => {
        const cache = await caches.open(APP_CACHE);
        const request = event.request.mode === 'navigate' ? './index.html' : event.request;
        return await cache.match(request) || fetch(event.request);
    })());
});
