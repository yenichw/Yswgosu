/**
 * =====================================================================
 *  osu! Audio Engine (Web Audio API + HTML5 Audio Fallback)
 *  Zero-latency track playback, high-precision clock fallback,
 *  preview audio streaming, and synthesized hitsounds.
 * =====================================================================
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.effectsGain = null;

    this.currentTrackBuffer = null;
    this.currentAudioBlobUrl = null;
    this.currentAudioElement = null;
    this.currentSourceNode = null;

    this.trackStartTime = 0;
    this.fallbackStartTime = 0;
    this.trackOffsetMs = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.pauseOffsetSec = 0;

    this.volumeMusic = 0.8;
    this.volumeEffects = 0.9;

    this._initContext();
  }

  _initContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        this.ctx = new AudioContextClass();

        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.volumeMusic;
        this.musicGain.connect(this.masterGain);

        this.effectsGain = this.ctx.createGain();
        this.effectsGain.gain.value = this.volumeEffects;
        this.effectsGain.connect(this.masterGain);
      } catch (e) {
        console.warn("Could not create Web Audio AudioContext:", e);
      }
    }
  }

  async resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (e) {}
    }
  }

  async loadTrackFromArrayBuffer(arrayBuffer) {
    await this.resume();
    this.stopTrack();
    if (!this.ctx) return null;
    try {
      this.currentTrackBuffer = await new Promise((resolve, reject) => {
        this.ctx.decodeAudioData(arrayBuffer, resolve, reject);
      });
    } catch (e) {
      console.warn("decodeAudioData failed in loadTrackFromArrayBuffer:", e);
    }
    return this.currentTrackBuffer;
  }

  playTrack(offsetMs = 0) {
    this.stopTrack();
    const startOffsetSec = Math.max(0, offsetMs / 1000);

    // 1. Try Web Audio buffer source
    if (this.ctx && this.currentTrackBuffer) {
      try {
        this.currentSourceNode = this.ctx.createBufferSource();
        this.currentSourceNode.buffer = this.currentTrackBuffer;
        this.currentSourceNode.connect(this.musicGain);
        this.trackStartTime = this.ctx.currentTime - startOffsetSec;
        this.currentSourceNode.start(0, startOffsetSec);
      } catch (e) {
        console.warn("Failed to start Web Audio source node:", e);
        this.currentSourceNode = null;
      }
    }

    // 2. Fallback to HTML5 Audio Element if Web Audio buffer not available
    if (!this.currentSourceNode && this.currentAudioBlobUrl) {
      try {
        this.currentAudioElement = new Audio(this.currentAudioBlobUrl);
        this.currentAudioElement.volume = this.volumeMusic;
        this.currentAudioElement.currentTime = startOffsetSec;
        this.currentAudioElement.play().catch(e => {
          console.warn("HTML5 audio play blocked or failed:", e);
        });
      } catch (e) {
        console.warn("Failed to initialize HTML5 Audio element:", e);
      }
    }

    // 3. Fallback high-resolution clock (guarantees gameplay NEVER freezes at 0ms)
    this.fallbackStartTime = performance.now() - offsetMs;
    this.isPlaying = true;
    this.isPaused = false;
  }

  playPreviewUrl(url) {
    this.stopTrack();
    if (!url) return;
    try {
      this.currentAudioElement = new Audio(url);
      this.currentAudioElement.volume = this.volumeMusic;
      this.currentAudioElement.play().catch(e => {
        console.warn("Preview play failed:", e);
      });
      this.isPlaying = true;
      this.isPaused = false;
      this.fallbackStartTime = performance.now();
    } catch (e) {
      console.warn("Could not play preview URL:", e);
    }
  }

  pauseTrack() {
    if (!this.isPlaying || this.isPaused) return;

    if (this.currentSourceNode && this.ctx) {
      this.pauseOffsetSec = this.ctx.currentTime - this.trackStartTime;
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch (e) {}
      this.currentSourceNode = null;
    } else if (this.currentAudioElement) {
      this.pauseOffsetSec = this.currentAudioElement.currentTime;
      try {
        this.currentAudioElement.pause();
      } catch (e) {}
    } else {
      this.pauseOffsetSec = (performance.now() - this.fallbackStartTime) / 1000;
    }

    this.isPaused = true;
  }

  resumeTrack() {
    if (!this.isPaused) return;
    this.playTrack(this.pauseOffsetSec * 1000);
  }

  stopTrack() {
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch (e) {}
      this.currentSourceNode = null;
    }

    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
        this.currentAudioElement.src = "";
      } catch (e) {}
      this.currentAudioElement = null;
    }

    this.isPlaying = false;
    this.isPaused = false;
    this.pauseOffsetSec = 0;
  }

  getCurrentTimeMs() {
    if (!this.isPlaying) return 0;
    if (this.isPaused) return this.pauseOffsetSec * 1000;

    // 1. High-precision Web Audio hardware clock
    if (this.currentSourceNode && this.ctx) {
      return (this.ctx.currentTime - this.trackStartTime) * 1000;
    }

    // 2. High-precision monotonic clock synchronized with HTML5 audio (smooth, no 250ms jitter)
    if (this.currentAudioElement && !this.currentAudioElement.paused) {
      const now = performance.now();
      const rawAudioMs = this.currentAudioElement.currentTime * 1000;
      const monotonicMs = now - this.fallbackStartTime;

      const drift = rawAudioMs - monotonicMs;
      if (Math.abs(drift) > 50) {
        this.fallbackStartTime = now - rawAudioMs;
      }
      return now - this.fallbackStartTime;
    }

    // 3. High-resolution monotonic fallback clock
    return performance.now() - this.fallbackStartTime;
  }

  getDurationMs() {
    if (this.currentTrackBuffer) return this.currentTrackBuffer.duration * 1000;
    if (this.currentAudioElement && this.currentAudioElement.duration) {
      return this.currentAudioElement.duration * 1000;
    }
    return 0;
  }

  // ===================================================================
  //  SYNTHESIZED HITSOUNDS (Zero latency, no files needed)
  // ===================================================================
  playHitSound(hitSoundType = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Default hitnormal (clean wooden pop / tick)
    this._playNormalHit(now);

    const isWhistle = (hitSoundType & 2) !== 0;
    const isFinish  = (hitSoundType & 4) !== 0;
    const isClap    = (hitSoundType & 8) !== 0;

    if (isClap) this._playClapHit(now);
    if (isFinish) this._playFinishHit(now);
    if (isWhistle) this._playWhistleHit(now);
  }

  _playNormalHit(t) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.05);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.effectsGain);

    osc.start(t);
    osc.stop(t + 0.065);
  }

  _playClapHit(t) {
    // Noise burst snare clap
    const bufferSize = this.ctx.sampleRate * 0.08;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.015));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1800, t);
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.65, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.effectsGain);

    noise.start(t);
    noise.stop(t + 0.085);
  }

  _playFinishHit(t) {
    // Shimmering cymbal finish
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(1100, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.35);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.effectsGain);

    osc.start(t);
    osc.stop(t + 0.36);
  }

  _playWhistleHit(t) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.linearRampToValueAtTime(1174, t + 0.07);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.effectsGain);

    osc.start(t);
    osc.stop(t + 0.125);
  }

  playComboBreak() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.22);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.effectsGain);

    osc.start(t);
    osc.stop(t + 0.23);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = AudioEngine;
}
