// ════════════════════════════════════════════════════════════════════════
// shared/js/offline-sync.js — Offline Attendance Submission Queue (add-on)
//
// PURPOSE (separate concern from shared/js/offline-data-cache.js)
//   offline-data-cache.js makes sure screens can still READ data (course
//   list, roster, etc.) with no internet. This file makes sure an
//   attendance SUBMISSION (a POST) is never lost when the network is
//   down or unreliable:
//     • Online              → the request goes straight to the real
//                              backend, exactly like a normal fetch.
//     • Offline / a network
//       failure happens     → the exact same payload is saved into
//                              IndexedDB on this device and the caller is
//                              told "saved, will sync automatically"
//                              instead of seeing an error.
//     • Real backend errors
//       (bad data, duplicate
//       lecture, etc.)      → surfaced immediately as a normal error —
//                              NEVER silently queued, so the teacher/HOD
//                              always finds out right away if something
//                              is actually wrong with what they entered.
//   Once queued, the record uploads automatically the moment a
//   connection is available again — no need to keep the site open:
//     1. While this tab is open: a network 'online' event, the tab
//        becoming visible again, and a periodic safety-net check all
//        trigger an immediate flush of anything still queued.
//     2. Even if the tab/app is closed: an Background Sync request is
//        registered with the Service Worker, which flushes the same
//        IndexedDB queue in the background as soon as the OS reports a
//        connection — see teacher/sw.js and hod/sw.js's 'sync' handler.
//        (Background Sync is supported on Chrome/Android; on browsers
//        without it, step 1 above still covers the very next time the
//        teacher opens the app.)
//
// HOW EXISTING CODE USES THIS FILE
//   teacher/js/attendance.js and hod/js/attendance.js call
//   OfflineAttendanceSync.submit({ role, url, payload }) instead of
//   posting directly. Nothing else about those screens changes.
// ════════════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const DB_NAME = "eadronix_offline_queue_db";
  const DB_VERSION = 1;
  const STORE = "attendanceQueue";
  const REQUEST_TIMEOUT_MS = 12000;
  const SYNC_TAG = "eadronix-attendance-sync";
  const SAFETY_NET_INTERVAL_MS = 45000;

  // ── IndexedDB plumbing (own DB/store, separate from the GET-cache's DB
  // in offline-data-cache.js, so the two add-ons never contend). This is
  // also opened the exact same way inside teacher/sw.js and hod/sw.js so
  // the Service Worker can flush the same queue while the page is closed.
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
          db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function enqueue(record) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          const req = tx.objectStore(STORE).add(record);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }),
    );
  }

  function getAllQueued() {
    return openDb().then(
      (db) =>
        new Promise((resolve) => {
          const tx = db.transaction(STORE, "readonly");
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        }),
    );
  }

  function removeQueued(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        }),
    );
  }

  function countQueued() {
    return getAllQueued().then((rows) => rows.length);
  }

  function fetchWithTimeout(url, opts, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...opts, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
  }

  function currentToken() {
    return (
      localStorage.getItem("sal_at") || localStorage.getItem("sal_token")
    );
  }

  function authedPostOpts(payload, token) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return { method: "POST", headers, body: JSON.stringify(payload) };
  }

  // Asks the Service Worker to take over and try again the moment the OS
  // reports connectivity, even if this tab gets closed. Best-effort —
  // silently does nothing on browsers that don't support Background Sync
  // (e.g. iOS Safari); the 'online'/visibility/interval triggers below
  // still cover those the next time the app is opened.
  function requestBackgroundSync() {
    try {
      if ("serviceWorker" in navigator && "SyncManager" in global) {
        navigator.serviceWorker.ready
          .then((reg) => reg.sync.register(SYNC_TAG))
          .catch(() => {});
      }
    } catch (_) {
      /* not supported — ignore */
    }
  }

  function notify(msg) {
    if (typeof global.showToast === "function") {
      try {
        global.showToast(msg);
      } catch (_) {}
    }
  }

  // Submits one attendance payload.
  //   role:    "teacher" | "hod" — kept on the queued record for clarity/
  //            future use (e.g. a "pending uploads" screen); not required
  //            for the upload itself since `url` is already the full,
  //            correct endpoint for that role.
  //   url:     e.g. "/api/teacher/attendance" or "/api/hod/attendance"
  //   payload: the exact JSON body to POST.
  // Resolves — never rejects — with:
  //   { success:true,  offline:false, ...serverJson }  → uploaded now
  //   { success:true,  offline:true,  message }         → queued, will
  //                                                        sync automatically
  //   { success:false, offline:false, message }         → a REAL error
  //                                                        from the server
  //                                                        (nothing queued)
  async function submit({ role, url, payload }) {
    const token = currentToken();

    // Fast path: browser already knows it has no connection at all —
    // don't waste time waiting on a request that can't possibly succeed.
    if (global.navigator && navigator.onLine === false) {
      return queueForLater({ role, url, payload, token });
    }

    try {
      const res = await fetchWithTimeout(
        url,
        authedPostOpts(payload, token),
        REQUEST_TIMEOUT_MS,
      );
      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
      if (res.ok) {
        return Object.assign({ offline: false }, data || { success: true });
      }
      // The server was reachable and responded — this is a REAL error
      // (validation, conflict, permission, etc.), not a connectivity
      // problem, so it must NOT be queued; surface it immediately.
      return {
        success: false,
        offline: false,
        message:
          (data && (data.message || data.error)) ||
          `Failed to save attendance (${res.status}).`,
      };
    } catch (networkErr) {
      // fetch threw: no connection, DNS/host unreachable, request timed
      // out, or the connection dropped mid-request. Save it locally.
      return queueForLater({ role, url, payload, token });
    }
  }

  async function queueForLater({ role, url, payload, token }) {
    try {
      await enqueue({ role, url, payload, token, createdAt: Date.now() });
    } catch (dbErr) {
      // IndexedDB itself unavailable (very old/locked-down browser) —
      // nothing more we can do; be honest about it instead of pretending
      // it was saved.
      return {
        success: false,
        offline: true,
        message:
          "No internet connection, and this device could not save the record for later. Please try again once you're back online.",
      };
    }
    requestBackgroundSync();
    scheduleForegroundRetrySoon();
    return {
      success: true,
      offline: true,
      message:
        "No internet connection — attendance has been saved on this device and will upload automatically as soon as you're back online.",
    };
  }

  // Flushes every queued record, in the order it was created. Stops as
  // soon as a network-level failure happens (still offline) and leaves
  // whatever's left in the queue for the next trigger. A real server
  // error for one record (e.g. that lecture was somehow already synced
  // another way) is removed from the queue after reporting it, so it
  // doesn't block every record behind it forever.
  let syncing = false;
  async function syncAll() {
    if (syncing) return { synced: 0, failed: 0 };
    if (global.navigator && navigator.onLine === false)
      return { synced: 0, failed: 0 };
    syncing = true;
    let synced = 0;
    let failed = 0;
    try {
      const rows = await getAllQueued();
      rows.sort((a, b) => a.createdAt - b.createdAt);
      for (const row of rows) {
        const token = currentToken() || row.token;
        let res;
        try {
          res = await fetchWithTimeout(
            row.url,
            authedPostOpts(row.payload, token),
            REQUEST_TIMEOUT_MS,
          );
        } catch (networkErr) {
          // Connection dropped again mid-flush — stop here, keep the
          // rest queued, and let the next trigger pick up where we left
          // off.
          break;
        }
        if (res.ok) {
          await removeQueued(row.id);
          synced++;
        } else {
          // A real, non-network rejection — don't keep retrying a
          // request that will just fail the same way forever.
          let msg = `Attendance record from ${new Date(row.createdAt).toLocaleString()} could not be uploaded`;
          try {
            const data = await res.json();
            if (data && (data.message || data.error))
              msg += ": " + (data.message || data.error);
          } catch (_) {}
          await removeQueued(row.id);
          failed++;
          notify(msg);
        }
      }
    } finally {
      syncing = false;
    }
    if (synced > 0) {
      notify(
        synced === 1
          ? "1 offline attendance record uploaded successfully ✅"
          : `${synced} offline attendance records uploaded successfully ✅`,
      );
      try {
        global.dispatchEvent(
          new CustomEvent("eadronix:offline-sync", {
            detail: { synced, failed },
          }),
        );
      } catch (_) {}
    }
    return { synced, failed };
  }

  let retryTimer = null;
  function scheduleForegroundRetrySoon() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      syncAll();
    }, 3000);
  }

  // ── Automatic triggers, while the tab/app is open ──
  global.addEventListener("online", () => syncAll());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncAll();
  });
  // Safety net for connections that recover without ever firing a clean
  // 'online' event (common on flaky mobile data).
  setInterval(() => {
    if (!navigator.onLine) return;
    syncAll();
  }, SAFETY_NET_INTERVAL_MS);
  // Anything left over from a previous offline session should try to go
  // out the moment the app is opened again.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => syncAll());
  } else {
    syncAll();
  }

  global.OfflineAttendanceSync = {
    submit,
    syncAll,
    pendingCount: countQueued,
  };
})(window);
