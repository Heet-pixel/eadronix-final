// ════════════════════════════════════════════════════════════════════════
// shared/js/offline-data-cache.js — Offline GET-Response Cache (add-on module)
//
// PURPOSE
//   offline-sync.js (separate file) makes sure an attendance SUBMISSION
//   (a POST) is never lost when the network is down. This file solves the
//   other half of "working offline": every screen that needs to READ data
//   first — course list, semester list, subject list, the class roster
//   used to build the seat grid, the teacher/HOD's own profile, etc. —
//   currently calls straight through to the network and shows an empty or
//   "failed to load" state the moment that call fails, which is exactly
//   why Course/Subject/Student selection couldn't be completed offline
//   even though submitting attendance already worked offline.
//
//   This file transparently caches the JSON body of every successful GET
//   request (keyed by the exact request URL, so different course/semester
//   query strings are cached separately) into IndexedDB. The next time
//   that same GET is attempted and the network is unavailable or fails,
//   the last successful response for that exact URL is served back
//   instead — so Course → Semester → Subject → Student roster selection
//   (and therefore marking attendance) keeps working offline, using
//   whatever was last synced while online (e.g. this morning on campus
//   Wi-Fi).
//
// HOW EXISTING CODE USES THIS FILE
//   teacher/js/api.js's salFetch(), hod/js/api.js's salFetch(), and
//   hod/js/data.js's apiJson() route their GET requests through
//   OfflineDataCache.fetchJson(url, opts) instead of calling fetch()
//   directly. Nothing else changes:
//     • Online, request succeeds → behaves exactly like a normal fetch
//       (and the response is also saved to the cache in the background).
//     • Offline, or the request fails/times out → the last cached
//       response for that exact URL is served back instead, so the
//       calling screen renders with the last-known-good data instead of
//       an empty/error state.
//     • Nothing has ever been cached for that URL yet (e.g. never opened
//       online) → the original network error is re-thrown, so existing
//       error handling behaves exactly as it did before this file existed.
//   POST/PUT/DELETE requests are NEVER routed through this file — they
//   always go straight to the network, completely unchanged. This file
//   only ever caches/serves READS, never writes.
// ════════════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const DB_NAME = "eadronix_api_cache_db";
  const DB_VERSION = 1;
  const STORE = "getCache";
  const REQUEST_TIMEOUT_MS = 15000;

  // ── IndexedDB plumbing (own DB, separate from offline-sync.js's queue
  // DB, so the two add-ons never contend over the same connection). ────
  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in global)) {
        reject(new Error("IndexedDB not supported in this browser."));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "url" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function readCache(url) {
    return openDb()
      .then(
        (db) =>
          new Promise((resolve) => {
            const tx = db.transaction(STORE, "readonly");
            const req = tx.objectStore(STORE).get(url);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          }),
      )
      .catch(() => null);
  }

  function writeCache(url, data) {
    return openDb()
      .then(
        (db) =>
          new Promise((resolve) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put({ url, data, savedAt: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          }),
      )
      .catch(() => {});
  }

  function fetchWithTimeout(url, opts, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...opts, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
  }

  // Builds a Response-alike object from cached data so callers that do
  // `res.status`, `res.ok`, `await res.json()` etc. keep working exactly
  // the same whether the answer came from the network or from cache.
  function cachedResponse(data) {
    return new Response(JSON.stringify(data), {
      status: 200,
      statusText: "OK (offline cache)",
      headers: {
        "Content-Type": "application/json",
        "X-Offline-Cache": "1",
      },
    });
  }

  // GET only. Success → cache the body (fire-and-forget, doesn't delay the
  // return) and hand back the real Response, untouched. Failure (offline,
  // DNS/connection error, timeout, server unreachable) → serve the last
  // cached response for this exact URL if one exists; otherwise re-throw
  // so the caller's existing error handling still runs unchanged.
  async function fetchJson(url, opts) {
    opts = opts || {};
    try {
      const res = await fetchWithTimeout(url, opts, REQUEST_TIMEOUT_MS);
      if (res && res.ok) {
        res
          .clone()
          .json()
          .then((data) => writeCache(url, data))
          .catch(() => {
            // Non-JSON success response (unlikely for these APIs) — just
            // don't cache it; the real response still goes back to the
            // caller normally.
          });
      }
      return res;
    } catch (networkErr) {
      const cached = await readCache(url);
      if (cached) return cachedResponse(cached.data);
      throw networkErr;
    }
  }

  global.OfflineDataCache = {
    fetchJson,
    // Exposed for future use (e.g. a "Clear offline data" settings
    // option, or showing "data as of <time>" on a screen) — not wired
    // into any UI yet, safe no-ops for existing code.
    get: readCache,
    set: writeCache,
  };
})(window);
