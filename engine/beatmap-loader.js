/**
 * =====================================================================
 *  Yswgosu / osu! Beatmap & Asset Loader
 *  Unpacks .osz archives in-memory using JSZip, extracts background artwork,
 *  streams audio instantly via HTML5 Blob URLs with background Web Audio decode,
 *  and manages persistent IndexedDB storage & multi-mirror online downloads.
 * =====================================================================
 */

class BeatmapLoader {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.beatmapSets = [];
    this.activeSet = null;
    this.activeDifficulty = null;
    this.onSetLoaded = null;
  }

  /**
   * Loads preloaded official tracks and all stored beatmaps from IndexedDB
   */
  async initDefaultBeatmaps() {
    this.isLoading = true;
    if (window.EngineLog) window.EngineLog.info("LOADER", "Starting beatmap initialization sequence...");

    // 1. Fast initial track (circle the halls, 2.9 MB)
    const primaryPath = "assets/osu-assets/osu.Game.Resources/Tracks/christmas2024.osz";
    try {
      if (window.EngineLog) window.EngineLog.info("LOADER", `Fetching primary track: ${primaryPath}`);
      const res = await fetch(primaryPath);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        await this.importOsz(buffer);
        if (window.EngineLog) window.EngineLog.info("LOADER", "Primary track unpacked successfully");
        if (this.onSetLoaded) this.onSetLoaded();
      }
    } catch (e) {
      if (window.EngineLog) window.EngineLog.warn("LOADER", `Failed loading primary track ${primaryPath}: ${e.message}`);
    }

    // 2. Load stored user beatmaps from persistent IndexedDB
    try {
      if (typeof BeatmapStorage !== "undefined") {
        const stored = await BeatmapStorage.loadAllBeatmaps();
        if (stored.length > 0) {
          if (window.EngineLog) window.EngineLog.info("LOADER", `Restoring ${stored.length} tracks from IndexedDB`);
          for (const item of stored) {
            if (item.data) {
              try { await this.importOsz(item.data); } catch (err) {}
            }
          }
          if (this.onSetLoaded) this.onSetLoaded();
        }
      }
    } catch (e) {
      if (window.EngineLog) window.EngineLog.warn("LOADER", "IndexedDB restore error: " + e.message);
    }

    this.isLoading = false;
    if (this.onSetLoaded) this.onSetLoaded();

    // 3. Non-blocking background preload of Renatus (6 MB, 12 difficulties)
    // Ensures mobile UI stays 100% smooth and interactive immediately!
    setTimeout(async () => {
      const secondaryPath = "assets/osu-assets/osu.Game.Resources/Tracks/renatus.osz";
      try {
        if (window.EngineLog) window.EngineLog.info("LOADER", `Background preloading ${secondaryPath}...`);
        const res = await fetch(secondaryPath);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          await this.importOsz(buffer);
          if (window.EngineLog) window.EngineLog.info("LOADER", "Renatus (12 diffs) background preload complete!");
          if (this.onSetLoaded) this.onSetLoaded();
        }
      } catch (err) {
        if (window.EngineLog) window.EngineLog.warn("LOADER", `Background preload skipped/failed: ${err.message}`);
      }
    }, 400);
  }

  /**
   * Imports an .osz file from an ArrayBuffer / File object using JSZip
   */
  async importOsz(fileOrBuffer) {
    if (typeof JSZip === "undefined") {
      throw new Error("JSZip is not available for unpacking .osz");
    }

    let buffer = fileOrBuffer;
    if (fileOrBuffer instanceof Blob || (typeof File !== "undefined" && fileOrBuffer instanceof File)) {
      buffer = await fileOrBuffer.arrayBuffer();
    }

    const zip = await JSZip.loadAsync(buffer);
    const osuFiles = [];
    const allAudioEntries = [];
    const allImageEntries = [];

    // Scan all files in archive
    zip.forEach((relativePath, zipEntry) => {
      const lower = relativePath.toLowerCase();
      if (lower.endsWith(".osu")) {
        osuFiles.push(zipEntry);
      } else if (lower.endsWith(".mp3") || lower.endsWith(".ogg") || lower.endsWith(".wav")) {
        allAudioEntries.push(zipEntry);
      } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")) {
        allImageEntries.push(zipEntry);
      }
    });

    if (osuFiles.length === 0) {
      throw new Error("No .osu files found in archive");
    }

    // Parse all difficulties first to find the primary song AudioFilename and Background
    let targetAudioFilename = "";
    let targetBgFilename = "";
    const standardDiffs = [];
    const otherModeDiffs = [];

    for (const osuEntry of osuFiles) {
      try {
        const rawText = await osuEntry.async("text");
        const parsed = BeatmapParser.parse(rawText);

        if (!parsed || !parsed.hitObjects || parsed.hitObjects.length === 0) continue;

        if (!targetAudioFilename && parsed.general && parsed.general.AudioFilename) {
          targetAudioFilename = parsed.general.AudioFilename.trim().toLowerCase();
        }

        if (!targetBgFilename && parsed.events && parsed.events.background) {
          targetBgFilename = parsed.events.background.trim().toLowerCase();
        }

        const mode = parseInt(parsed.general.Mode, 10);
        if (isNaN(mode) || mode === 0) {
          standardDiffs.push(parsed);
        } else {
          otherModeDiffs.push(parsed);
        }
      } catch (err) {
        console.warn("Error parsing .osu diff:", err);
      }
    }

    let parsedDiffs = [];
    if (standardDiffs.length > 0) {
      parsedDiffs = standardDiffs;
    } else if (otherModeDiffs.length > 0) {
      // Auto-convert non-standard maps (Taiko/Catch/Mania) to standard 512x384 playfield
      for (const diff of otherModeDiffs) {
        const mode = parseInt(diff.general.Mode, 10);
        const modeLabel = mode === 1 ? "Taiko" : mode === 2 ? "Catch" : "Mania";
        diff.metadata.Version = `${diff.metadata.Version} [${modeLabel}]`;

        diff.hitObjects.forEach((obj) => {
          if (mode === 1) {
            // Taiko: smooth rhythmic circular flow around playfield center (256, 192)
            const angle = (obj.time / 550) % (Math.PI * 2);
            const radius = 120 + Math.sin(obj.time / 1200) * 45;
            obj.x = Math.max(50, Math.min(462, Math.round(256 + Math.cos(angle) * radius)));
            obj.y = Math.max(50, Math.min(334, Math.round(192 + Math.sin(angle) * radius)));
          } else if (mode === 3) {
            // Mania: 4-lane layout mapped across playfield
            const col = Math.min(3, Math.floor((obj.x || 0) * 4 / 512));
            obj.x = 96 + col * 106;
            obj.y = Math.max(60, Math.min(324, 120 + ((obj.time / 700) % 180)));
          } else if (mode === 2) {
            // Catch: retain horizontal position, smooth wave vertical
            obj.y = Math.max(60, Math.min(324, 192 + Math.sin(obj.time / 600) * 90));
          }
        });
        parsedDiffs.push(diff);
      }
      if (window.EngineLog) {
        window.EngineLog.info("LOADER", `Auto-converted ${parsedDiffs.length} non-standard diffs into osu!standard`);
      }
    }

    if (parsedDiffs.length === 0) {
      return null;
    }

    // Sort difficulties by star rating / difficulty
    parsedDiffs.sort((a, b) => {
      const dA = a.difficulty;
      const dB = b.difficulty;
      const srA = (dA.OverallDifficulty || 5) * 0.4 + (dA.ApproachRate || 5) * 0.35 + (dA.CircleSize || 4) * 0.25;
      const srB = (dB.OverallDifficulty || 5) * 0.4 + (dB.ApproachRate || 5) * 0.35 + (dB.CircleSize || 4) * 0.25;
      return srA - srB;
    });

    // Locate the exact song audio entry
    let audioFileEntry = null;
    if (targetAudioFilename) {
      const cleanTargetAudio = targetAudioFilename.replace(/\\/g, "/");
      const baseTargetAudio = cleanTargetAudio.split("/").pop();
      audioFileEntry = allAudioEntries.find(e => {
        const lower = e.name.toLowerCase().replace(/\\/g, "/");
        return lower === cleanTargetAudio || lower.endsWith("/" + baseTargetAudio) || lower === baseTargetAudio;
      });
    }
    if (!audioFileEntry && allAudioEntries.length > 0) {
      // Pick the largest audio file (avoids short hitsounds like soft-hitnormal.wav)
      audioFileEntry = allAudioEntries.reduce((prev, curr) => {
        const prevSize = (prev._data && prev._data.uncompressedSize) || 0;
        const currSize = (curr._data && curr._data.uncompressedSize) || 0;
        return currSize > prevSize ? curr : prev;
      }, allAudioEntries[0]);
    }

    // Extract audio blob & blob URL (Instant HTML5 playback)
    let audioBlobUrl = null;
    let pendingAudioBlob = null;

    if (audioFileEntry) {
      try {
        pendingAudioBlob = await audioFileEntry.async("blob");
        audioBlobUrl = URL.createObjectURL(pendingAudioBlob);
      } catch (e) {
        console.warn("Could not extract audio from osz:", e);
      }
    }

    // Locate the background image entry
    let bgFileEntry = null;
    if (targetBgFilename) {
      const cleanTargetBg = targetBgFilename.replace(/\\/g, "/");
      const baseTargetBg = cleanTargetBg.split("/").pop();
      bgFileEntry = allImageEntries.find(e => {
        const lower = e.name.toLowerCase().replace(/\\/g, "/");
        return lower === cleanTargetBg || lower.endsWith("/" + baseTargetBg) || lower === baseTargetBg;
      });
    }
    if (!bgFileEntry && allImageEntries.length > 0) {
      // Pick the largest image file (the full background wallpaper)
      bgFileEntry = allImageEntries.reduce((prev, curr) => {
        const prevSize = (prev._data && prev._data.uncompressedSize) || 0;
        const currSize = (curr._data && curr._data.uncompressedSize) || 0;
        return currSize > prevSize ? curr : prev;
      }, allImageEntries[0]);
    }

    let bgUrl = null;
    if (bgFileEntry) {
      try {
        const blob = await bgFileEntry.async("blob");
        bgUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.warn("Could not extract bg image from osz:", e);
      }
    }

    // Attach audio and background to all difficulties
    for (const diff of parsedDiffs) {
      diff._audioBuffer = null;
      diff._audioBlobUrl = audioBlobUrl;
      diff._bgUrl = bgUrl;
    }

    // Group into a set
    const meta = parsedDiffs[0].metadata;
    const setId = meta.BeatmapSetID > 0 ? meta.BeatmapSetID : Date.now();
    const previewTime = parsedDiffs[0].general.PreviewTime > 0 ? parsedDiffs[0].general.PreviewTime : 35000;

    const newSet = {
      id: setId,
      title: meta.Title || "Unknown Title",
      artist: meta.Artist || "Unknown Artist",
      creator: meta.Creator || "Unknown",
      bgUrl: bgUrl,
      audioBuffer: null,
      audioBlobUrl: audioBlobUrl,
      previewTime: previewTime,
      difficulties: parsedDiffs,
    };

    // Non-blocking background decode for Web Audio buffer (keeps UI & audio instantly responsive on PC)
    if (pendingAudioBlob && this.audio && this.audio.ctx) {
      pendingAudioBlob.arrayBuffer().then(buf => {
        this.audio.ctx.decodeAudioData(buf, (decoded) => {
          newSet.audioBuffer = decoded;
          for (const diff of parsedDiffs) {
            diff._audioBuffer = decoded;
          }
        }, () => {});
      }).catch(() => {});
    }

    // Prevent duplicate sets with same title or ID
    const existingIdx = this.beatmapSets.findIndex(s =>
      (s.id && newSet.id && s.id == newSet.id) ||
      (s.title && newSet.title && s.title.toLowerCase() === newSet.title.toLowerCase())
    );
    if (existingIdx !== -1) {
      this.beatmapSets[existingIdx] = newSet;
    } else {
      this.beatmapSets.push(newSet);
    }

    if (!this.activeSet) {
      this.activeSet = newSet;
      this.activeDifficulty = newSet.difficulties[0];
    }

    return newSet;
  }

  async importOszFile(fileOrBuffer) {
    return await this.importOsz(fileOrBuffer);
  }

  /**
   * Search beatmap mirrors online (osu.direct / sayobot / catboy)
   */
  async searchOnline(query) {
    if (!query || !query.trim()) return [];

    const apiBase = window.API_BASE || "";
    if (apiBase) {
      try {
        const res = await fetch(`${apiBase}/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) return list;
        }
      } catch (e) {
        console.warn("Local search proxy failed, falling back to direct:", e);
      }
    }

    // Direct browser fallback 1: osu.direct with mode=0 (standard osu! first)
    try {
      const res = await fetch(`https://osu.direct/api/v2/search?q=${encodeURIComponent(query)}&mode=0`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch (e) {
      console.warn("osu.direct mode=0 search failed, trying general search:", e);
    }

    // Direct browser fallback 2: osu.direct general (all modes)
    try {
      const res = await fetch(`https://osu.direct/api/v2/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch (e) {}

    // Direct browser fallback 2: catboy
    try {
      const res = await fetch(`https://catboy.best/api/v2/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) return list;
      }
    } catch (e) {}

    return [];
  }

  /**
   * Helper: fetch binary data with strict timeout and live streaming progress
   */
  async _fetchBufferWithProgress(url, timeoutMs = 12000, onProgress = null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const total = parseInt(res.headers.get("content-length") || "0", 10);

      // Stream with progress if ReadableStream reader is supported
      if (res.body && res.body.getReader) {
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (typeof onProgress === "function") {
            const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
            onProgress(pct, received, total);
          }
        }

        const fullBuffer = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) {
          fullBuffer.set(c, offset);
          offset += c.length;
        }
        return fullBuffer.buffer;
      } else {
        const buf = await res.arrayBuffer();
        if (typeof onProgress === "function") onProgress(100, buf.byteLength, buf.byteLength);
        return buf;
      }
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /**
   * Download .osz directly from mirror with live progress and persist to IndexedDB
   */
  async downloadOnlineSet(setId, onProgress = null) {
    if (window.EngineLog) {
      window.EngineLog.info("LOADER", `Starting beatmap download for setId=${setId}...`);
    }

    let arrayBuffer = null;
    const apiBase = window.API_BASE || "";

    const candidateUrls = [];
    if (apiBase) {
      candidateUrls.push({
        name: "Local Plugin Server",
        url: `${apiBase}/api/download?id=${encodeURIComponent(setId)}`,
        timeout: 8000
      });
    }

    // 1. osu.direct /api/d endpoint (verified clean CORS on GitHub Pages, fastest mirror)
    candidateUrls.push({
      name: "osu.direct (noVideo)",
      url: `https://osu.direct/api/d/${encodeURIComponent(setId)}?noVideo=1`,
      timeout: 12000
    });
    candidateUrls.push({
      name: "osu.direct (standard)",
      url: `https://osu.direct/api/d/${encodeURIComponent(setId)}`,
      timeout: 14000
    });

    // 2. Nerinyan mirror (clean CORS, Cloudflare)
    candidateUrls.push({
      name: "Nerinyan mirror",
      url: `https://api.nerinyan.moe/d/${encodeURIComponent(setId)}?noVideo=true`,
      timeout: 10000
    });

    // 3. Sayobot mirror (strict 5s timeout to prevent hanging on port 25225)
    candidateUrls.push({
      name: "Sayobot mini",
      url: `https://dl.sayobot.cn/beatmaps/download/mini/${encodeURIComponent(setId)}`,
      timeout: 5000
    });

    let lastError = null;
    for (const mirror of candidateUrls) {
      try {
        if (window.EngineLog) {
          window.EngineLog.info("LOADER", `Connecting to ${mirror.name}...`);
        }
        arrayBuffer = await this._fetchBufferWithProgress(mirror.url, mirror.timeout, onProgress);
        if (arrayBuffer && arrayBuffer.byteLength > 1000) {
          if (window.EngineLog) {
            window.EngineLog.info("LOADER", `Downloaded ${(arrayBuffer.byteLength / 1048576).toFixed(2)} MB from ${mirror.name}`);
          }
          break;
        }
      } catch (err) {
        lastError = err;
        if (window.EngineLog) {
          window.EngineLog.warn("LOADER", `${mirror.name} failed: ${err.message}`);
        }
      }
    }

    if (!arrayBuffer || arrayBuffer.byteLength <= 1000) {
      const errMsg = lastError ? lastError.message : "All mirrors unreachable";
      if (window.EngineLog) {
        window.EngineLog.error("LOADER", `Download failed for setId=${setId}: ${errMsg}`);
      }
      throw new Error(`Download failed: ${errMsg}`);
    }

    if (window.EngineLog) {
      window.EngineLog.info("LOADER", `Unpacking .osz archive (${(arrayBuffer.byteLength / 1048576).toFixed(2)} MB)...`);
    }

    const newSet = await this.importOsz(arrayBuffer);
    if (newSet) {
      if (setId && (!newSet.id || newSet.id <= 0)) {
        newSet.id = setId;
      }
      this.activeSet = newSet;
      this.activeDifficulty = newSet.difficulties[0];
      if (this.audio) {
        this.audio.currentTrackBuffer = newSet.audioBuffer;
        this.audio.currentAudioBlobUrl = newSet.audioBlobUrl;
      }

      // Persist to IndexedDB so it never disappears on restart!
      if (typeof BeatmapStorage !== "undefined") {
        try {
          await BeatmapStorage.saveBeatmap(setId, newSet.title, arrayBuffer);
          if (window.EngineLog) {
            window.EngineLog.info("STORAGE", `Beatmap "${newSet.title}" saved to IndexedDB`);
          }
        } catch (storageErr) {
          if (window.EngineLog) {
            window.EngineLog.warn("STORAGE", `IndexedDB save skipped: ${storageErr.message}`);
          }
        }
      }

      if (window.EngineLog) {
        window.EngineLog.info("LOADER", `Beatmap ready: "${newSet.title}" (${newSet.difficulties.length} diffs)`);
      }

      if (this.onSetLoaded) this.onSetLoaded();
    }
    return newSet;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = BeatmapLoader;
}
