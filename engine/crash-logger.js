/**
 * =====================================================================
 *  Yswgosu Crash Logger & Diagnostics Engine
 *  Catches ANY uncaught exception, unhandled promise rejection,
 *  Web Audio failures, and logs a real-time event timeline.
 *  Displays an unmissable onscreen error modal with full stack trace & restart.
 * =====================================================================
 */

(function initCrashLogger() {
  const MAX_LOGS = 100;
  window.__ENGINE_LOGS__ = [];

  function logEvent(level, category, message, details = null) {
    const entry = {
      time: new Date().toISOString().split("T")[1].replace("Z", ""),
      level,
      category,
      message: String(message),
      details,
    };
    window.__ENGINE_LOGS__.push(entry);
    if (window.__ENGINE_LOGS__.length > MAX_LOGS) {
      window.__ENGINE_LOGS__.shift();
    }

    const consoleMethod = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
    consoleMethod(`[Yswgosu][${entry.time}][${category}] ${message}`, details || "");

    const debugContainer = document.getElementById("engine-live-logs");
    if (debugContainer && debugContainer.style.display !== "none") {
      updateLiveLogsUI();
    }
  }

  window.EngineLog = {
    info: (cat, msg, det) => logEvent("INFO", cat, msg, det),
    warn: (cat, msg, det) => logEvent("WARN", cat, msg, det),
    error: (cat, msg, det) => logEvent("ERROR", cat, msg, det),
    crash: (err, context) => showCrashModal(err, context),
  };

  function showCrashModal(err, context = "Runtime Error") {
    logEvent("ERROR", "CRASH", `${context}: ${err ? (err.message || err) : "Unknown error"}`, err ? err.stack : null);

    let modal = document.getElementById("engine-crash-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "engine-crash-modal";
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 6, 12, 0.94);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 20px;
        box-sizing: border-box;
      `;

      modal.innerHTML = `
        <div style="
          background: #180a13;
          border: 1.5px solid #ff1744;
          box-shadow: 0 0 35px rgba(255, 23, 68, 0.45);
          border-radius: 16px;
          max-width: 680px;
          width: 100%;
          color: #ffffff;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        ">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.6rem;">⚠️</span>
              <span style="font-size: 1.3rem; font-weight: 800; color: #ff5252; letter-spacing: 0.5px;">Yswgosu Engine Diagnostics</span>
            </div>
            <span id="crash-context-badge" style="background: rgba(255, 23, 68, 0.2); color: #ff80ab; font-size: 0.75rem; padding: 4px 10px; border-radius: 12px; font-weight: 600;">Crash</span>
          </div>

          <div style="background: rgba(255, 23, 68, 0.08); border-left: 4px solid #ff1744; padding: 12px 14px; border-radius: 4px;">
            <div id="crash-message" style="font-weight: 700; color: #ffcdd2; font-size: 0.95rem; word-break: break-word;"></div>
          </div>

          <div style="font-size: 0.8rem; color: #ff80ab; text-transform: uppercase; font-weight: 700; letter-spacing: 0.8px;">Stack Trace</div>
          <pre id="crash-stack" style="
            background: #0d040a;
            border: 1px solid rgba(255, 23, 68, 0.25);
            border-radius: 8px;
            padding: 12px;
            margin: 0;
            font-family: monospace;
            font-size: 0.78rem;
            color: #ef9a9a;
            max-height: 140px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
          "></pre>

          <div style="font-size: 0.8rem; color: #00e5ff; text-transform: uppercase; font-weight: 700; letter-spacing: 0.8px;">Recent Sequence Events</div>
          <pre id="crash-history" style="
            background: #0d040a;
            border: 1px solid rgba(0, 229, 255, 0.25);
            border-radius: 8px;
            padding: 12px;
            margin: 0;
            font-family: monospace;
            font-size: 0.72rem;
            color: #80deea;
            max-height: 120px;
            overflow-y: auto;
            white-space: pre-wrap;
          "></pre>

          <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
            <button id="btn-copy-crash-log" style="
              background: rgba(255, 255, 255, 0.08);
              border: 1px solid rgba(255, 255, 255, 0.2);
              color: #ffffff;
              padding: 9px 18px;
              border-radius: 8px;
              font-weight: 600;
              cursor: pointer;
            ">📋 Copy Log</button>
            <button id="btn-dismiss-crash" style="
              background: rgba(255, 255, 255, 0.12);
              border: 1px solid rgba(255, 255, 255, 0.3);
              color: #ffffff;
              padding: 9px 18px;
              border-radius: 8px;
              font-weight: 600;
              cursor: pointer;
            ">Dismiss</button>
            <button id="btn-restart-engine" style="
              background: #ff1744;
              border: none;
              color: #ffffff;
              padding: 9px 20px;
              border-radius: 8px;
              font-weight: 700;
              cursor: pointer;
              box-shadow: 0 4px 14px rgba(255, 23, 68, 0.4);
            ">🔄 Restart</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById("btn-restart-engine").onclick = () => window.location.reload();
      document.getElementById("btn-dismiss-crash").onclick = () => { modal.style.display = "none"; };
      document.getElementById("btn-copy-crash-log").onclick = () => {
        const fullLog = `[Yswgosu Crash Log]\nContext: ${context}\nError: ${err ? (err.message || err) : "Unknown"}\nStack:\n${err ? err.stack : "None"}\n\nTimeline:\n` +
          window.__ENGINE_LOGS__.map(l => `[${l.time}][${l.level}][${l.category}] ${l.message}`).join("\n");
        navigator.clipboard.writeText(fullLog).then(() => {
          document.getElementById("btn-copy-crash-log").innerText = "✓ Copied!";
          setTimeout(() => { document.getElementById("btn-copy-crash-log").innerText = "📋 Copy Log"; }, 2000);
        });
      };
    }

    modal.style.display = "flex";
    document.getElementById("crash-context-badge").innerText = context;
    document.getElementById("crash-message").innerText = err ? (err.message || String(err)) : "Unknown runtime exception occurred.";
    document.getElementById("crash-stack").innerText = err ? (err.stack || "No JS stack trace available.") : "None";
    document.getElementById("crash-history").innerText = window.__ENGINE_LOGS__.slice(-15).map(l => `[${l.time}][${l.level}][${l.category}] ${l.message}`).join("\n");
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function isNonFatal(msg) {
    if (!msg) return false;
    const s = String(msg).toLowerCase();
    return (
      s.includes("audiocontext") ||
      s.includes("play()") ||
      s.includes("interrupted") ||
      s.includes("user didn't interact") ||
      s.includes("the operation was aborted") ||
      s.includes("failed to load") ||
      s.includes("loadimagebitmap") ||
      s.includes("failed to fetch") ||
      s.includes("503") ||
      s.includes("404") ||
      s.includes("networkerror") ||
      s.includes("seasonal backgrounds") ||
      s.includes("loader.load") ||
      s.includes("resizeloop") ||
      s.includes("resizeobserver loop")
    );
  }

  // Hook global unhandled errors
  window.addEventListener("error", (e) => {
    const msg = String(e.error || e.message || "");
    if (isNonFatal(msg)) {
      logEvent("WARN", "RUNTIME", msg);
      return;
    }
    showCrashModal(e.error || e.message, `Uncaught Exception (${e.filename || "inline"}:${e.lineno || 0})`);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const msg = reason ? (reason.message || String(reason)) : "";
    if (isNonFatal(msg)) {
      logEvent("WARN", "ASSET_LOADER", `Non-fatal asset/network warning: ${msg}`);
      return;
    }
    showCrashModal(e.reason, "Unhandled Promise Rejection");
  });

  // Floating Diagnostics Toggle Button in Top Right
  window.addEventListener("DOMContentLoaded", () => {
    const diagBtn = document.createElement("button");
    diagBtn.id = "btn-open-diagnostics";
    diagBtn.innerText = "⚡ Logs";
    diagBtn.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 999999;
      background: rgba(20, 15, 25, 0.65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 102, 171, 0.35);
      border-radius: 16px;
      color: #ff80ab;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 4px 10px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s, background 0.2s;
    `;
    diagBtn.onmouseenter = () => { diagBtn.style.opacity = "1"; };
    diagBtn.onmouseleave = () => { diagBtn.style.opacity = "0.7"; };
    diagBtn.onclick = () => toggleLiveLogsModal();
    document.body.appendChild(diagBtn);
  });

  function toggleLiveLogsModal() {
    let container = document.getElementById("engine-live-logs-modal");
    if (!container) {
      container = document.createElement("div");
      container.id = "engine-live-logs-modal";
      container.style.cssText = `
        position: fixed;
        bottom: 16px;
        right: 16px;
        width: 380px;
        max-width: 90vw;
        max-height: 320px;
        background: rgba(16, 10, 24, 0.95);
        border: 1.5px solid rgba(0, 229, 255, 0.4);
        border-radius: 12px;
        z-index: 1000000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
        font-family: monospace;
        font-size: 0.72rem;
        color: #ffffff;
      `;
      container.innerHTML = `
        <div style="background: rgba(26, 18, 39, 0.95); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,229,255,0.2);">
          <span style="font-weight: 700; color: #00e5ff;">Engine Event Timeline</span>
          <button id="btn-close-live-logs" style="background: transparent; border: none; color: #ff80ab; cursor: pointer; font-size: 0.9rem;">✕</button>
        </div>
        <div id="engine-live-logs-list" style="padding: 8px 12px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 4px;"></div>
      `;
      document.body.appendChild(container);
      document.getElementById("btn-close-live-logs").onclick = () => {
        container.style.display = "none";
      };
    }

    if (container.style.display === "none") {
      container.style.display = "flex";
      updateLiveLogsUI();
    } else {
      container.style.display = "none";
    }
  }

  function updateLiveLogsUI() {
    const list = document.getElementById("engine-live-logs-list");
    if (!list) return;
    list.innerHTML = window.__ENGINE_LOGS__.slice(-25).map(l => {
      const color = l.level === "ERROR" ? "#ff1744" : l.level === "WARN" ? "#ffd600" : "#00e5ff";
      return `<div style="line-height: 1.3;"><span style="color: #827296;">[${l.time}]</span> <span style="color: ${color}; font-weight: 700;">[${l.category}]</span> ${escapeHtml(l.message)}</div>`;
    }).join("");
    list.scrollTop = list.scrollHeight;
  }

  logEvent("INFO", "BOOT", "Diagnostics engine initialized successfully");
})();
