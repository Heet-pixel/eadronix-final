// ════════════════════════════════════════════════════════════════════════
// shared/js/offline-sync.js — Offline Attendance Sync (add-on module)
//
// PURPOSE
//   Adds Offline Attendance Support to the Teacher & HOD "Mark Attendance"
//   screens WITHOUT touching any existing API client, route, schema, or
//   business logic. This file is 100% self-contained:
//     • Own IndexedDB store (does not read/write MongoDB directly — that
//       still only ever happens through the existing, unchanged REST APIs)
//     • Own tiny fetch/auth-refresh helper (mirrors the token convention
//       already used by teacher/js/api.js and hod/js/data.js, but does not
//       call into those files, so nothing there needs to change)
//     • Own small UI (status pill + offline banner + review panel),
//       injected at runtime — no existing DOM/CSS is modified
//
// HOW THE EXISTING SCREENS USE THIS FILE
//   The only integration point is a single call at the exact place where
//   the Mark-Attendance screens currently call the network:
//
//       const res = await OfflineAttendanceSync.submit({
//         role: 'teacher' | 'hod',
//         url:  '/api/teacher/attendance'  (same endpoint as always),
//         payload: <the exact same request body as before>,
//       });
//
//   • Online + server accepts it   → behaves exactly like the old direct
//     fetch/TAPI/apiJson call (same success/error shape is returned).
//   • Offline, or a network/server error happens → the payload is saved
//     to IndexedDB and this resolves with { success:true, offline:true },
//     so the calling screen can let the teacher/HOD keep working normally,
//     exactly like the existing "online success" path does.
//   • A genuine rejection from the server (validation error, duplicate
//     lecture 409, permission error, etc.) is returned unchanged as
//     { success:false, message } — nothing is queued, nothing hidden.
//
//   Queued records are POSTed to the SAME endpoint with the SAME body the
//   instant the browser is back online (and periodically thereafter as a
//   safety net), so MongoDB — and therefore Student/Parent/Reports/
//   Dashboards, which all read from MongoDB — only change once the sync
//   actually succeeds. Nothing extra was needed there; it falls out of
//   simply not calling the API until sync time.
// ════════════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const DB_NAME = "eadronix_offline_db";
  const DB_VERSION = 1;
  const STORE = "attendanceQueue";
  const REQUEST_TIMEOUT_MS = 15000;
  const AUTO_SYNC_INTERVAL_MS = 20000;
  const PING_URL = "/api/health";
  const PING_TIMEOUT_MS = 4000;

  // ── IndexedDB plumbing ──────────────────────────────────────────────
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
          const store = db.createObjectStore(STORE, { keyPath: "localId" });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function addRecord(record) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).add(record);
          tx.oncomplete = () => resolve(record);
          tx.onerror = () => reject(tx.error);
        }),
    );
  }

  function putRecord(record) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(record);
          tx.oncomplete = () => resolve(record);
          tx.onerror = () => reject(tx.error);
        }),
    );
  }

  function deleteRecord(localId) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(localId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    );
  }

  function getAllRecords() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readonly");
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        }),
    );
  }

  function uuid() {
    if (global.crypto && global.crypto.randomUUID)
      return global.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0,
        v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ── Auth helpers (reads the SAME localStorage keys the existing app
  // already writes at login — nothing new is stored, nothing existing is
  // changed. This lets queued requests authenticate exactly like a normal
  // API call would.) ──────────────────────────────────────────────────
  function authHeaders() {
    const at =
      localStorage.getItem("sal_at") || localStorage.getItem("sal_token");
    const h = { "Content-Type": "application/json" };
    if (at) h["Authorization"] = "Bearer " + at;
    return h;
  }

  let refreshPromise = null;
  function tryRefreshToken() {
    const rt =
      localStorage.getItem("sal_rt") || localStorage.getItem("sal_refresh");
    if (!rt) return Promise.resolve(false);
    if (!refreshPromise) {
      refreshPromise = fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error("refresh failed");
          const d = await r.json();
          if (d.accessToken) {
            localStorage.setItem("sal_at", d.accessToken);
            localStorage.setItem("sal_token", d.accessToken);
          }
          if (d.refreshToken) {
            localStorage.setItem("sal_rt", d.refreshToken);
            localStorage.setItem("sal_refresh", d.refreshToken);
          }
          return true;
        })
        .catch(() => false)
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  function fetchWithTimeout(url, opts, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...opts, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
  }

  // Sends ONE record (live or queued) to its endpoint using the exact same
  // payload it would have used online. Classifies the outcome so the
  // caller can decide whether to queue, retry, or surface a real error.
  async function attemptSend(record, retried) {
    let res;
    try {
      res = await fetchWithTimeout(
        record.url,
        {
          method: record.method || "POST",
          headers: authHeaders(),
          body: JSON.stringify(record.payload),
        },
        REQUEST_TIMEOUT_MS,
      );
    } catch (e) {
      return {
        outcome: "network",
        error:
          e.name === "AbortError" ? "Request timed out." : "Network error.",
      };
    }

    if (res.status === 401 && !retried) {
      const refreshed = await tryRefreshToken();
      if (refreshed) return attemptSend(record, true);
      return {
        outcome: "rejected",
        error: "Session expired. Please log in again.",
      };
    }

    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* non-JSON body — fall through with empty data */
    }

    // Duplicate protection: the backend already rejects an exact-duplicate
    // lecture with 409. If a queued record hits this, it means the record
    // made it into MongoDB on an earlier attempt (e.g. the connection
    // dropped after the server saved it but before our client got the
    // response) — so treat it as already synced, not as an error.
    if (res.status === 409) {
      return {
        outcome: "duplicate",
        error: data.message || "Already submitted.",
      };
    }
    if (res.status >= 500) {
      return { outcome: "server", error: data.message || "Server error." };
    }
    if (!res.ok || data.success === false) {
      return {
        outcome: "rejected",
        error: data.message || "Request rejected.",
        data,
      };
    }
    return { outcome: "success", data };
  }

  function enqueue({ role, url, payload }) {
    const record = {
      localId: uuid(),
      role,
      url,
      method: "POST",
      payload,
      status: "pending", // 'pending' | 'error' (needs manual review)
      attempts: 0,
      createdAt: new Date().toISOString(),
      lastAttemptAt: null,
      lastError: null,
    };
    return addRecord(record).then(() => record);
  }

  // ── Public: submit() — the single integration point used at the call
  // sites inside teacher/js/attendance.js and hod/js/attendance.js ─────
  async function submit({ role, url, payload }) {
    if (!navigator.onLine) {
      await enqueue({ role, url, payload });
      refreshIndicator();
      return {
        success: true,
        offline: true,
        queued: true,
        message:
          "You're offline. Attendance saved on this device and will sync automatically once internet is back.",
      };
    }

    const result = await attemptSend({ url, payload, method: "POST" });

    if (result.outcome === "success") {
      refreshIndicator();
      return result.data && Object.keys(result.data).length
        ? result.data
        : { success: true };
    }

    if (result.outcome === "network" || result.outcome === "server") {
      // Never lose attendance: connection/server hiccup even though the
      // browser thought it was online — queue it and keep going.
      await enqueue({ role, url, payload });
      refreshIndicator();
      scheduleSync(1000);
      return {
        success: true,
        offline: true,
        queued: true,
        message:
          "Connection issue reaching the server. Attendance saved on this device and will sync automatically.",
      };
    }

    // 'rejected' or 'duplicate' on a LIVE (not-yet-queued) submission is a
    // genuine response from the server (validation error, duplicate
    // lecture, permission issue) — surface it exactly like the original
    // direct-API-call flow did. Nothing is queued.
    return {
      success: false,
      message: result.error || "Failed to save attendance.",
    };
  }

  // ── Background sync of the IndexedDB queue ──────────────────────────
  let syncing = false;
  let syncTimer = null;
  function scheduleSync(delayMs) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncAll();
    }, delayMs);
  }

  async function syncAll() {
    if (syncing) return;
    if (!navigator.onLine) {
      refreshIndicator();
      return;
    }
    const all = await getAllRecords().catch(() => []);
    const pending = all.filter((r) => r.status !== "error");
    if (!pending.length) {
      refreshIndicator();
      return;
    }

    syncing = true;
    refreshIndicator();
    let syncedCount = 0;

    for (const record of pending) {
      if (!navigator.onLine) break; // lost connection mid-batch — stop, resume later
      let result;
      try {
        result = await attemptSend(record);
      } catch (e) {
        result = { outcome: "network", error: e.message || "Network error." };
      }

      if (result.outcome === "success" || result.outcome === "duplicate") {
        await deleteRecord(record.localId).catch(() => {});
        syncedCount++;
      } else if (result.outcome === "rejected") {
        // Genuinely invalid queued record (e.g. a validation rule now
        // fails). Never delete it — keep it locally, but stop auto-retrying
        // so it doesn't spin forever; surface it for manual review instead.
        record.status = "error";
        record.lastError = result.error;
        record.lastAttemptAt = new Date().toISOString();
        record.attempts = (record.attempts || 0) + 1;
        await putRecord(record).catch(() => {});
      } else {
        // network / server error — keep retrying automatically
        record.lastError = result.error;
        record.lastAttemptAt = new Date().toISOString();
        record.attempts = (record.attempts || 0) + 1;
        await putRecord(record).catch(() => {});
      }
    }

    syncing = false;
    refreshIndicator();
    if (syncedCount > 0) flashSynced();
  }

  // Manual retry / discard, used from the review panel for records stuck
  // in 'error' status.
  async function retryRecord(localId) {
    const all = await getAllRecords().catch(() => []);
    const record = all.find((r) => r.localId === localId);
    if (!record) return;
    record.status = "pending";
    await putRecord(record).catch(() => {});
    refreshIndicator();
    scheduleSync(200);
  }

  async function discardRecord(localId) {
    await deleteRecord(localId).catch(() => {});
    refreshIndicator();
  }

  // ── Lightweight real-connectivity probe (navigator.onLine can be true
  // even with no real internet, e.g. on a captive portal) ─────────────
  async function pingServer() {
    try {
      await fetchWithTimeout(PING_URL, { method: "GET" }, PING_TIMEOUT_MS);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ── UI: status pill, offline banner, review panel ───────────────────
  let ui = null;
  let flashTimer = null;

  function ensureUI() {
    if (ui) return ui;

    const style = document.createElement("style");
    style.textContent = `
      #oas-offline-banner{position:fixed;top:0;left:0;right:0;z-index:99998;display:none;
        align-items:center;gap:10px;padding:10px 16px;background:#7a4d00;color:#fff;
        font:600 13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        box-shadow:0 2px 10px rgba(0,0,0,.18);}
      #oas-offline-banner .oas-ic{font-size:18px;line-height:1}
      #oas-offline-banner b{font-weight:800}
      #oas-status-pill{position:fixed;right:16px;bottom:16px;z-index:99999;cursor:pointer;
        display:flex;align-items:center;gap:6px;padding:8px 13px;border-radius:999px;
        background:#1c2333;color:#f1f3f9;font:700 12.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        box-shadow:0 6px 20px rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.08);
        transition:background .2s ease;user-select:none;}
      #oas-status-pill:hover{background:#262f45}
      #oas-status-pill .oas-dot{font-size:11px}
      #oas-panel{position:fixed;right:16px;bottom:60px;z-index:99999;width:300px;max-width:calc(100vw - 32px);
        max-height:60vh;overflow-y:auto;display:none;background:#181d29;color:#eef0f7;
        border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);
        font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:12px;}
      #oas-panel h4{margin:0 0 8px;font-size:13px;font-weight:800;color:#fff}
      #oas-panel .oas-empty{color:#9aa3bf;padding:8px 2px;font-weight:600}
      #oas-panel .oas-item{padding:9px 10px;border-radius:10px;background:#222a3d;margin-bottom:8px}
      #oas-panel .oas-item .oas-item-title{font-weight:700;color:#fff;margin-bottom:2px}
      #oas-panel .oas-item .oas-item-meta{color:#9aa3bf;font-size:11.5px;margin-bottom:6px}
      #oas-panel .oas-item .oas-item-err{color:#ff8a8a;font-size:11.5px;margin-bottom:6px}
      #oas-panel .oas-row{display:flex;gap:6px}
      #oas-panel button.oas-btn{flex:1;border:none;border-radius:8px;padding:6px 8px;font-weight:700;
        font-size:11.5px;cursor:pointer}
      #oas-panel button.oas-retry{background:#2f6fed;color:#fff}
      #oas-panel button.oas-discard{background:#3a3f52;color:#eef0f7}
      #oas-panel .oas-syncnow{width:100%;margin-top:2px;border:none;border-radius:10px;padding:8px;
        background:#16a34a;color:#fff;font-weight:800;font-size:12.5px;cursor:pointer}
    `;
    document.head.appendChild(style);

    const banner = document.createElement("div");
    banner.id = "oas-offline-banner";
    banner.innerHTML =
      '<span class="oas-ic">📴</span><span><b>Offline Mode</b><br>Attendance will sync automatically when internet is available.</span>';
    document.body.appendChild(banner);

    const pill = document.createElement("div");
    pill.id = "oas-status-pill";
    pill.title = "Attendance sync status — tap for details";
    document.body.appendChild(pill);

    const panel = document.createElement("div");
    panel.id = "oas-panel";
    document.body.appendChild(panel);

    pill.addEventListener("click", () => {
      panel.style.display = panel.style.display === "block" ? "none" : "block";
      if (panel.style.display === "block") renderPanel();
    });

    ui = { banner, pill, panel };
    return ui;
  }

  function flashSynced() {
    ensureUI();
    if (flashTimer) clearTimeout(flashTimer);
    ui.pill.innerHTML = '<span class="oas-dot">✅</span> Synced Successfully';
    flashTimer = setTimeout(() => {
      flashTimer = null;
      refreshIndicator();
    }, 3000);
  }

  async function refreshIndicator() {
    ensureUI();
    const online = navigator.onLine;
    ui.banner.style.display = online ? "none" : "flex";

    if (flashTimer) return; // let the "Synced Successfully" flash finish first

    const all = await getAllRecords().catch(() => []);
    const pendingCount = all.filter((r) => r.status !== "error").length;
    const errorCount = all.filter((r) => r.status === "error").length;

    if (syncing) {
      ui.pill.innerHTML = '<span class="oas-dot">🔄</span> Syncing…';
      return;
    }
    if (!online) {
      ui.pill.innerHTML = pendingCount
        ? `<span class="oas-dot">🟠</span> Offline · ${pendingCount} Record${pendingCount === 1 ? "" : "s"} Waiting`
        : '<span class="oas-dot">🟠</span> Offline';
      return;
    }
    if (errorCount > 0) {
      ui.pill.innerHTML = `<span class="oas-dot">⚠️</span> ${errorCount} Need${errorCount === 1 ? "s" : ""} Review`;
      return;
    }
    if (pendingCount > 0) {
      ui.pill.innerHTML = `<span class="oas-dot">🟢</span> Online · ${pendingCount} Pending`;
      return;
    }
    ui.pill.innerHTML = '<span class="oas-dot">🟢</span> Online';
  }

  async function renderPanel() {
    ensureUI();
    const all = await getAllRecords().catch(() => []);
    all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

    if (!all.length) {
      ui.panel.innerHTML = `<h4>Attendance Sync</h4><div class="oas-empty">Nothing waiting to sync. You're all caught up.</div>`;
      return;
    }

    const itemHtml = all
      .map((r) => {
        const p = r.payload || {};
        const title = `${p.subject || "Subject"} · ${p.course || ""}${p.semester ? " Sem " + p.semester : ""}`;
        const meta = `${p.date || ""}${p.time ? " · " + p.time : ""}`;
        if (r.status === "error") {
          return `
            <div class="oas-item">
              <div class="oas-item-title">${escapeHtml(title)}</div>
              <div class="oas-item-meta">${escapeHtml(meta)}</div>
              <div class="oas-item-err">⚠️ ${escapeHtml(r.lastError || "Could not sync.")}</div>
              <div class="oas-row">
                <button class="oas-btn oas-retry" data-retry="${r.localId}">Retry</button>
                <button class="oas-btn oas-discard" data-discard="${r.localId}">Discard</button>
              </div>
            </div>`;
        }
        return `
          <div class="oas-item">
            <div class="oas-item-title">${escapeHtml(title)}</div>
            <div class="oas-item-meta">${escapeHtml(meta)} · waiting to sync${r.attempts ? " · " + r.attempts + " attempt" + (r.attempts === 1 ? "" : "s") : ""}</div>
          </div>`;
      })
      .join("");

    ui.panel.innerHTML = `<h4>Attendance Sync</h4>${itemHtml}<button class="oas-syncnow" id="oas-sync-now">🔄 Sync Now</button>`;

    ui.panel.querySelectorAll("[data-retry]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await retryRecord(btn.getAttribute("data-retry"));
        renderPanel();
      });
    });
    ui.panel.querySelectorAll("[data-discard]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Discard this attendance record? This cannot be undone."))
          return;
        await discardRecord(btn.getAttribute("data-discard"));
        renderPanel();
      });
    });
    const syncNowBtn = document.getElementById("oas-sync-now");
    if (syncNowBtn) syncNowBtn.addEventListener("click", () => syncAll());
  }

  function escapeHtml(s) {
    return String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  // ── Wiring ────────────────────────────────────────────────────────
  let initialized = false;
  function init(opts) {
    if (initialized) return;
    initialized = true;
    ensureUI();
    refreshIndicator();

    window.addEventListener("online", () => {
      refreshIndicator();
      scheduleSync(500);
    });
    window.addEventListener("offline", () => {
      refreshIndicator();
    });

    // Periodic safety-net sync (covers cases where the 'online' event
    // doesn't fire reliably, and catches leftover queued items from a
    // previous session/browser restart).
    setInterval(() => {
      if (navigator.onLine) syncAll();
    }, AUTO_SYNC_INTERVAL_MS);

    if (navigator.onLine) scheduleSync(800);
  }

  const OfflineAttendanceSync = {
    init,
    submit,
    syncAll,
    getPendingCount: async () => {
      const all = await getAllRecords().catch(() => []);
      return all.filter((r) => r.status !== "error").length;
    },
  };

  global.OfflineAttendanceSync = OfflineAttendanceSync;

  // Registers the role's app-shell Service Worker (teacher/sw.js or
  // hod/sw.js). This is a separate concern from everything above: it
  // makes the PAGE ITSELF (same HTML/CSS/JS, same styling) load with no
  // or poor internet, once the browser has opened it successfully at
  // least once. It never touches /api/* — see the sw.js file header.
  function registerServiceWorker(role) {
    if (!("serviceWorker" in navigator)) return;
    const scope = "/" + role + "/";
    navigator.serviceWorker
      .register(scope + "sw.js", { scope })
      .catch((err) => {
        console.warn(
          "[OfflineAttendanceSync] service worker registration failed:",
          err.message,
        );
      });
  }

  // Auto-init on the two roles that mark attendance and therefore need
  // offline support: Teacher and HOD. Other portals aren't affected
  // (this script is not even loaded there).
  function autoInit() {
    const path = global.location.pathname || "";
    let role = null;
    if (path.startsWith("/teacher")) role = "teacher";
    else if (path.startsWith("/hod")) role = "hod";
    if (!role) return;
    OfflineAttendanceSync.init({ role });
    registerServiceWorker(role);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})(window);
