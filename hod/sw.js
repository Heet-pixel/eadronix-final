// ════════════════════════════════════════════════════════════════════════
// hod/sw.js — App-Shell Offline Cache (PWA add-on)
//
// PURPOSE (separate concern from shared/js/offline-sync.js)
//   offline-sync.js makes sure an attendance SUBMISSION is never lost when
//   the network is down/poor, once the page is already open.
//   This file makes sure the PAGE ITSELF — same HTML, same CSS, same JS,
//   same look — still opens with no/poor internet, as long as the browser
//   loaded it successfully at least once before (e.g. the HOD opened
//   eadronix.com/hod on campus Wi-Fi this morning). That one-time
//   successful load is unavoidable: no browser can download a page it has
//   never once fetched with zero connectivity. After that first load,
//   this cache makes every later open instant and network-independent.
//
// It does NOT touch any API route, auth flow, or business logic — requests
// to /api/* are explicitly left alone and always go straight to the
// network, exactly as they do today.
// ════════════════════════════════════════════════════════════════════════

const CACHE_NAME = "eadronix-hod-shell-v2";
const SCOPE = "/hod/";

const APP_SHELL = [
  "/hod/",
  "/hod/index.html",
  "/hod/css/style.css",
  "/hod/logo.png",
  "/hod/manifest.json",
  "/hod/js/auth.js",
  "/hod/js/ui.js",
  "/hod/js/data.js",
  "/hod/js/api.js",
  "/hod/js/app.js",
  "/hod/js/dashboard.js",
  "/hod/js/students.js",
  "/hod/js/subjects.js",
  "/hod/js/cohodHistory.js",
  "/hod/js/teachers.js",
  "/hod/js/notices.js",
  "/hod/js/schedule.js",
  "/hod/js/attendance.js",
  "/hod/js/marks.js",
  "/hod/js/reports.js",
  "/hod/js/excel.js",
  "/hod/js/cc.js",
  "/hod/js/modals.js",
  "/shared/js/offline-sync.js",
  "/shared/js/offline-data-cache.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch((err) => {
              // Don't let one missing/blocked asset (e.g. a CDN hiccup)
              // stop the rest of the shell from being cached.
              console.warn("[hod/sw] could not cache", url, err.message);
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept API calls — auth, attendance submission, and every
  // other backend route always go straight to the network exactly as
  // today. Offline handling for THOSE is offline-sync.js's job, not this
  // file's.
  if (url.pathname.startsWith("/api/")) return;

  // Full-page navigations (typing/opening the URL, or the browser's SPA
  // fallback): prefer the network so the hod always gets the latest
  // version when online, but fall back to the cached shell instantly if
  // the network is down or too slow/poor to respond.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(CACHE_NAME)
            .then((c) => c.put("/hod/index.html", copy))
            .catch(() => {});
          return res;
        })
        .catch(() => caches.match("/hod/index.html")),
    );
    return;
  }

  // Static assets (css/js/logo/fonts/etc): cache-first for an instant,
  // reliable load regardless of connection quality, refreshing the cache
  // in the background whenever the network is actually available.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches
              .open(CACHE_NAME)
              .then((c) => c.put(req, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
