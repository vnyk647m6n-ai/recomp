/* Recomp Zwölf Wochen – Service Worker
   Zweck: Die App startet auch ohne Internet und holt sich Aktualisierungen,
   sobald wieder eine Verbindung da ist. */

const VERSION = "2026-11-10-2";
const SHELL   = "recomp-shell-" + VERSION;
const RUNTIME = "recomp-runtime-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

self.addEventListener("install", ev => {
  ev.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith("recomp-shell-") && k !== SHELL)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", ev => {
  if (ev.data === "skipWaiting") self.skipWaiting();
  if (ev.data === "version" && ev.source) ev.source.postMessage({ version: VERSION });
});

/* Netz zuerst, aber mit kurzer Geduld: nach 2,5 s kommt die gespeicherte Fassung.
   So ist die App offline sofort da und online trotzdem aktuell. */
function netFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const done = r => { if (!settled) { settled = true; resolve(r); } };

    const fallback = () => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : null))
      .then(hit => hit || new Response("Offline", { status: 503, statusText: "Offline" }))
      .then(done);

    const t = setTimeout(fallback, 2500);

    fetch(req).then(res => {
      clearTimeout(t);
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(req, copy)).catch(() => {});
      }
      done(res);
    }).catch(() => { clearTimeout(t); fallback(); });
  });
}

/* Schriften und andere fremde Dateien: einmal geholt, dann aus dem Speicher. */
function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    const copy = res.clone();
    caches.open(RUNTIME).then(c => c.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => hit));
}

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (url.origin === self.location.origin) ev.respondWith(netFirst(req));
  else ev.respondWith(cacheFirst(req));
});

/* Tippen auf die Mitteilung „Pause vorbei“ holt die App nach vorne. */
self.addEventListener("notificationclick", ev => {
  ev.notification.close();
  ev.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
