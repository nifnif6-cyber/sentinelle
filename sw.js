// Sentinelle : cache le solo hors ligne seulement. Genere par build_site.py, ne pas modifier a la main.
// Jamais PeerJS ni Supabase : le jeu en ligne a toujours besoin d une vraie connexion.
const CACHE = 'sentinelle-56ebb3f2eb';
const SCOPE = self.registration.scope;
const PRECACHE_PATHS = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const PRECACHE_URLS = PRECACHE_PATHS.map((p) => new URL(p, SCOPE).href);
const PAGE_URL = PRECACHE_URLS[0];
const ASSET_URLS = new Set(PRECACHE_URLS.slice(1));
function runtimeOk(u){
  if (u.hostname === 'cdn.jsdelivr.net') return u.pathname.indexOf('/npm/three@') === 0 || u.pathname.indexOf('/npm/es-module-shims@') === 0;
  return u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
}
function never(u){ return /peerjs|supabase/i.test(u.href); }

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE_URLS)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.indexOf('sentinelle-') === 0 && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let u;
  try { u = new URL(req.url); } catch (e){ return; }
  if (never(u)) return;   // jamais de cache pour PeerJS ni Supabase : toujours le reseau, meme hors ligne

  if (req.mode === 'navigate'){
    event.respondWith(
      fetch(req).then((res) => { if (res && res.ok) caches.open(CACHE).then((c) => c.put(PAGE_URL, res.clone())); return res; })
        .catch(() => caches.match(PAGE_URL, { cacheName: CACHE }).then((r) => r || caches.match(req)))
    );
    return;
  }

  if (ASSET_URLS.has(u.href) || runtimeOk(u)){
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => { try { caches.open(CACHE).then((c) => c.put(req, res.clone())); } catch (e){} return res; }))
    );
  }
});
