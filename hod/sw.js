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

const CACHE_NAME = "eadronix-hod-shell-v3";
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

// ════════════════════════════════════════════════════════════════════════
// Background Sync — flushes the SAME offline attendance queue that
// shared/js/offline-sync.js writes to (IndexedDB, db "eadronix_offline_queue_db",
// store "attendanceQueue"), but from here, in the Service Worker, so a
// queued attendance record still uploads even if the HOD has closed the
// tab/app. shared/js/offline-sync.js also flushes this same queue
// whenever the app IS open (on 'online', on becoming visible, and on a
// periodic safety-net check) — this handler covers the "app is closed"
// case using the browser's Background Sync API. Not supported on every
// browser (e.g. iOS Safari); on those, the queue simply waits and syncs
// the next time the app is opened, which the foreground code above
// always does.
// ════════════════════════════════════════════════════════════════════════
const QUEUE_DB_NAME = "eadronix_offline_queue_db";
const QUEUE_STORE = "attendanceQueue";

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllQueuedSW(db) {
  return new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function removeQueuedSW(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function flushAttendanceQueue() {
  let db;
  try {
    db = await openQueueDb();
  } catch (_) {
    return;
  }
  const rows = (await getAllQueuedSW(db)).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  let synced = 0;
  for (const row of rows) {
    let res;
    try {
      const headers = { "Content-Type": "application/json" };
      if (row.token) headers["Authorization"] = "Bearer " + row.token;
      res = await fetch(row.url, {
        method: "POST",
        headers,
        body: JSON.stringify(row.payload),
      });
    } catch (_) {
      // Still offline (or connection dropped again) — stop; the rest
      // stays queued for the next sync event or the next time the app
      // is opened.
      break;
    }
    if (res.ok) {
      await removeQueuedSW(db, row.id);
      synced++;
    } else if (res.status === 401) {
      // Stored token is stale/expired — the Service Worker has no way to
      // refresh it (no access to localStorage). Leave it queued; the
      // foreground code refreshes the token and retries as soon as the
      // app is opened again.
      break;
    } else {
      // A real, non-network rejection from the server — don't retry
      // this one forever.
      await removeQueuedSW(db, row.id);
    }
  }
  if (synced > 0) {
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) =>
      c.postMessage({ type: "eadronix:offline-sync", synced }),
    );
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "eadronix-attendance-sync") {
    event.waitUntil(flushAttendanceQueue());
  }
});
