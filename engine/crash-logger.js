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
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        font-family: 'Torus', -apple-system, sans-serif;
        color: #ffffff;
      `;
      document.body.appendChild(modal);
    }

    const errMessage = err ? (err.message || String(err)) : "Unknown Error";
    const errStack = err && err.stack ? err.stack : "No stack trace available";
    const recentLogs = window.__ENGINE_LOGS__.slice(-8).map(l => `[${l.time}][${l.level}][${l.category}] ${l.message}`).join("\n");

    modal.innerHTML = `
      <div style="background: rgba(28, 16, 26, 0.95); border: 2px solid #ff1744; border-radius: 14px; max-width: 720px; width: 100%; max-height: 85vh; overflow-y: auto; padding: 24px; box-shadow: 0 0 40px rgba(255, 23, 68, 0.6); box-sizing: border-box; display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 23, 68, 0.3); padding-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.8rem;">⚠️</span>
            <span style="font-size: 1.4rem; font-weight: 800; color: #ff1744; letter-spacing: 1px;">Yswgosu Engine Diagnostics</span>
          </div>
          <span style="font-size: 0.85rem; color: #ff80ab; background: rgba(255, 23, 68, 0.2); padding: 4px 10px; border-radius: 6px; font-weight: 700;">${context}</span>
        </div>

        <div style="font-size: 1.05rem; font-weight: 700; color: #ffffff; background: rgba(255, 23, 68, 0.15); padding: 12px; border-radius: 8px; border-left: 4px solid #ff1744;">
          ${escapeHtml(errMessage)}
        </div>

        <div>
          <div style="font-size: 0.82rem; font-weight: 700; color: #b3a5c4; margin-bottom: 4px; text-transform: uppercase;">Stack Trace</div>
          <pre style="background: #0a060f; color: #ff80ab; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 0.78rem; overflow-x: auto; max-height: 140px; margin: 0; white-space: pre-wrap; word-break: break-all;">${escapeHtml(errStack)}</pre>
        </div>

        <div>
          <div style="font-size: 0.82rem; font-weight: 700; color: #b3a5c4; margin-bottom: 4px; text-transform: uppercase;">Recent Sequence Events</div>
          <pre style="background: #0a060f; color: #00e5ff; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 0.75rem; overflow-x: auto; max-height: 120px; margin: 0; white-space: pre-wrap;">${escapeHtml(recentLogs)}</pre>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
          <button id="btn-copy-crash-log" style="padding: 10px 18px; border-radius: 8px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.3); color: #fff; font-weight: 600; cursor: pointer;">📋 Copy Log</button>
          <button id="btn-close-crash-modal" style="padding: 10px 18px; border-radius: 8px; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.3); color: #fff; font-weight: 600; cursor: pointer;">Dismiss</button>
          <button id="btn-reload-safe" style="padding: 10px 22px; border-radius: 8px; background: #ff1744; border: none; color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 2px 10px rgba(255, 23, 68, 0.5);">🔄 Restart</button>
        </div>
      </div>
    `;

    modal.style.display = "flex";

    const btnCopy = document.getElementById("btn-copy-crash-log");
    if (btnCopy) {
      btnCopy.onclick = () => {
        const fullReport = `=== Yswgosu Crash Report ===\nContext: ${context}\nError: ${errMessage}\n\nStack:\n${errStack}\n\nRecent Logs:\n${recentLogs}`;
        navigator.clipboard.writeText(fullReport).then(() => {
          btnCopy.innerText = "✓ Copied!";
          setTimeout(() => { btnCopy.innerText = "📋 Copy Log"; }, 2000);
        }).catch(() => {
          alert("Log copied to console!");
          console.log(fullReport);
        });
      };
    }

    const btnClose = document.getElementById("btn-close-crash-modal");
    if (btnClose) {
      btnClose.onclick = () => { modal.style.display = "none"; };
    }

    const btnReload = document.getElementById("btn-reload-safe");
    if (btnReload) {
      btnReload.onclick = () => { window.location.reload(); };
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Hook global unhandled errors
  window.addEventListener("error", (e) => {
    showCrashModal(e.error || e.message, `Uncaught Exception (${e.filename || "inline"}:${e.lineno || 0})`);
  });

  window.addEventListener("unhandledrejection", (e) => {
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
