/* מסך. — service worker
   מטרה: לאפשר התקנה כאפליקציה ושימוש בסיסי כשאין רשת, בלי לפגוע
   בטריות הנתונים כשיש רשת (data/*.json תמיד מנסים קודם לרענן). */
const CACHE = "masach-v1";
const APP_SHELL = ["./", "./index.html", "./icon.png", "./manifest.json"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req, "./"));
    return;
  }
  if (/\/data\/(showtimes|movies)\.json$/.test(url.pathname)) {
    e.respondWith(networkFirst(req));
    return;
  }
  e.respondWith(cacheFirst(req));
});

async function networkFirst(req, fallbackKey){
  const cache = await caches.open(CACHE);
  try{
    const res = await fetch(req);
    cache.put(fallbackKey || req, res.clone());
    return res;
  }catch(err){
    const cached = await cache.match(fallbackKey || req);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
