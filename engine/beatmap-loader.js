/**
 * =====================================================================
 *  osu! Beatmap & Asset Loader
 *  Unpacks .osz archives in-memory using JSZip, decodes audio, parses .osu files,
 *  extracts background artwork, and manages persistent IndexedDB storage & online search.
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
    // 1. Preloaded official tracks
    const defaultPaths = [
      "assets/osu-assets/osu.Game.Resources/Tracks/welcome.osz",
      "assets/osu-assets/osu.Game.Resources/Tracks/christmas2024.osz",
    ];

    for (const p of defaultPaths) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          await this.importOsz(buffer);
        }
      } catch (e) {
        console.warn("Could not preload " + p, e);
      }
    }

    // 2. Load all saved songs from persistent IndexedDB
    try {
      if (typeof BeatmapStorage !== "undefined") {
        const stored = await BeatmapStorage.loadAllBeatmaps();
        console.log(`Restoring ${stored.length} persistent beatmaps from IndexedDB...`);
        for (const item of stored) {
          if (item.data) {
            try {
              await this.importOsz(item.data);
            } catch (err) {
              console.warn("Failed to unpack stored beatmap:", item.id, err);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed loading saved beatmaps from storage:", e);
    }

    if (this.onSetLoaded) this.onSetLoaded();
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
    const parsedDiffs = [];

    for (const osuEntry of osuFiles) {
      try {
        const rawText = await osuEntry.async("text");
        const parsed = BeatmapParser.parse(rawText);

        if (!parsed) continue;

        // Filter: ONLY accept standard osu! (Mode 0) beatmaps with playable objects
        const mode = parseInt(parsed.general.Mode, 10);
        if (!isNaN(mode) && mode !== 0) {
          continue;
        }
        if (!parsed.hitObjects || parsed.hitObjects.length === 0) {
          continue;
        }

        if (!targetAudioFilename && parsed.general && parsed.general.AudioFilename) {
          targetAudioFilename = parsed.general.AudioFilename.trim().toLowerCase();
        }

        if (!targetBgFilename && parsed.events && parsed.events.background) {
          targetBgFilename = parsed.events.background.trim().toLowerCase();
        }

        parsedDiffs.push(parsed);
      } catch (err) {
        console.warn("Error parsing .osu diff:", err);
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

    // Extract audio blob & blob URL
    let audioBlobUrl = null;
    let audioBuffer = null;

    if (audioFileEntry) {
      try {
        const audioBlob = await audioFileEntry.async("blob");
        audioBlobUrl = URL.createObjectURL(audioBlob);

        // Attempt Web Audio decoding
        if (this.audio && this.audio.ctx) {
          try {
            await this.audio.resume();
            const audioArrayBuffer = await audioBlob.arrayBuffer();
            audioBuffer = await new Promise((resolve, reject) => {
              this.audio.ctx.decodeAudioData(audioArrayBuffer, resolve, reject);
            }).catch(() => null);
          } catch (e) {
            console.warn("Web Audio decodeAudioData skipped or failed, using HTML5 audio blob:", e);
          }
        }
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
      diff._audioBuffer = audioBuffer;
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
      audioBuffer: audioBuffer,
      audioBlobUrl: audioBlobUrl,
      previewTime: previewTime,
      difficulties: parsedDiffs,
    };

    // Prevent duplicate sets with same title
    const existingIdx = this.beatmapSets.findIndex(s => s.title.toLowerCase() === newSet.title.toLowerCase());
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
   * Search beatmap mirror online (catboy / mino via local proxy)
   */
  async searchOnline(query) {
    if (!query || !query.trim()) return [];

    const apiBase = window.API_BASE || "";
    try {
      const res = await fetch(`${apiBase}/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) return list;
      }
    } catch (e) {
      console.warn("Local search proxy failed, falling back to direct:", e);
    }

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
   * Download .osz directly from mirror via local proxy and persist to IndexedDB
   */
  async downloadOnlineSet(setId) {
    let arrayBuffer = null;

    const apiBase = window.API_BASE || "";
    try {
      const res = await fetch(`${apiBase}/api/download?id=${encodeURIComponent(setId)}`);
      if (res.ok) {
        arrayBuffer = await res.arrayBuffer();
      }
    } catch (e) {
      console.warn("Local download proxy failed, falling back to direct:", e);
    }

    if (!arrayBuffer) {
      const res = await fetch(`https://catboy.best/d/${encodeURIComponent(setId)}`);
      if (!res.ok) throw new Error("Download failed: " + res.statusText);
      arrayBuffer = await res.arrayBuffer();
    }

    const newSet = await this.importOsz(arrayBuffer);
    if (newSet) {
      this.activeSet = newSet;
      this.activeDifficulty = newSet.difficulties[0];
      if (this.audio) {
        this.audio.currentTrackBuffer = newSet.audioBuffer;
        this.audio.currentAudioBlobUrl = newSet.audioBlobUrl;
      }

      // Persist to IndexedDB so it never disappears on restart!
      if (typeof BeatmapStorage !== "undefined") {
        await BeatmapStorage.saveBeatmap(setId, newSet.title, arrayBuffer);
      }

      if (this.onSetLoaded) this.onSetLoaded();
    }
    return newSet;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = BeatmapLoader;
}
