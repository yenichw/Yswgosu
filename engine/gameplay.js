/**
 * =====================================================================
 *  osu! Gameplay Logic & Ruleset
 *  Evaluates judgements (300/100/50/Miss), accurate HP drain, scoring, combo,
 *  multi-touch support, indestructible Autoplay bot, NoFail, and HardRock mod.
 * =====================================================================
 */

class GameplayEngine {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.beatmap = null;

    // Difficulty constants
    this.hit300 = 80;
    this.hit100 = 140;
    this.hit50  = 200;
    this.approachTime = 1200;
    this.circleRadius = 36;

    // Mods
    this.isAuto = false;
    this.isNoFail = false;
    this.isHardRock = false;

    // Playfield transform (512x384 standard osu! playfield)
    this.playfield = {
      x: 0,
      y: 0,
      width: 512,
      height: 384,
      scale: 1,
    };

    // State
    this.isRunning = false;
    this.isPaused = false;
    this.isFailed = false;
    this.currentTime = 0;

    // Stats
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hp = 1.0;
    this.count300 = 0;
    this.count100 = 0;
    this.count50  = 0;
    this.countMiss = 0;

    // Hit bursts (floating numbers)
    this.hitBursts = [];

    // Pointer state
    this.pointer = { x: 256, y: 192, isDown: false };
    this.activeTouches = new Map();

    // Callbacks
    this.onGameEnd = null;
    this.onGameFail = null;
    this.onStatsUpdate = null;
  }

  loadBeatmap(beatmap) {
    this.beatmap = beatmap;
    const diff = beatmap.difficulty || {};

    // Base difficulty values
    let od = diff.OverallDifficulty !== undefined ? diff.OverallDifficulty : 5;
    let ar = diff.ApproachRate !== undefined ? diff.ApproachRate : 5;
    let cs = diff.CircleSize !== undefined ? diff.CircleSize : 4;
    let hp = diff.HPDrainRate !== undefined ? diff.HPDrainRate : 5;

    // HardRock mod adjustments (gives true authentic HardRock intensity)
    if (this.isHardRock) {
      od = Math.min(10, od * 1.4);
      // HardRock AR: must feel visibly and challenging fast (at least AR 8.5)
      ar = Math.min(10, Math.max(8.5, ar * 1.4));
      // HardRock CS: noticeably smaller circles (at least CS 5.2)
      cs = Math.min(10, Math.max(5.2, cs * 1.35));
      hp = Math.min(10, hp * 1.4);
    }

    // Calculate Hit Windows (OD)
    this.hit300 = Math.max(15, 80 - 6 * od);
    this.hit100 = Math.max(35, 140 - 8 * od);
    this.hit50  = Math.max(60, 200 - 10 * od);

    // Calculate Approach Time (AR)
    if (ar < 5) {
      this.approachTime = 1200 + 600 * (5 - ar) / 5;
    } else if (ar === 5) {
      this.approachTime = 1200;
    } else {
      this.approachTime = 1200 - 750 * (ar - 5) / 5;
    }

    // Circle Size (CS)
    this.circleRadius = Math.max(16, 54.4 - 4.48 * cs);
    if (this.isHardRock) {
      this.circleRadius = Math.max(16, this.circleRadius * 0.82);
    }

    // Process HitObjects (handle HR vertical flip and precalculate curves)
    for (const obj of this.beatmap.hitObjects) {
      obj.judged = false;
      obj.result = null;

      if (obj._origY === undefined) obj._origY = obj.y;
      obj.y = this.isHardRock ? (384 - obj._origY) : obj._origY;

      if (obj.objectType === "slider") {
        if (!obj._origCurvePoints) {
          obj._origCurvePoints = obj.curvePoints.map(p => ({ x: p.x, y: p.y }));
        }
        obj.curvePoints = obj._origCurvePoints.map(p => ({
          x: p.x,
          y: this.isHardRock ? (384 - p.y) : p.y
        }));

        if (typeof SliderCalculator !== "undefined") {
          obj.samples = SliderCalculator.getCurveSamples(obj.curvePoints, obj.curveType, obj.pixelLength);
        }
      }
    }

    this.resetStats();
  }

  resetStats() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hp = 1.0;
    this.count300 = 0;
    this.count100 = 0;
    this.count50  = 0;
    this.countMiss = 0;
    this.hitBursts = [];
    this.currentTime = 0;
    this.isFailed = false;
    this.activeTouches.clear();
  }

  start() {
    this.resetStats();
    this.isRunning = true;
    this.isPaused = false;
    this.isFailed = false;
    this.audio.playTrack(0);
  }

  pause() {
    if (!this.isRunning || this.isFailed) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.audio.pauseTrack();
    } else {
      this.audio.resumeTrack();
    }
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    this.audio.stopTrack();
  }

  _triggerFail() {
    if (this.isNoFail || this.isAuto || this.isFailed) return;
    this.isFailed = true;
    this.isRunning = false;
    this.audio.stopTrack();
    this.audio.playComboBreak();

    if (this.onGameFail) {
      this.onGameFail();
    }
  }

  updatePlayfieldBounds(canvasWidth, canvasHeight) {
    const targetAspect = 4 / 3;
    let w = canvasWidth * 0.90;
    let h = w / targetAspect;

    if (h > canvasHeight * 0.90) {
      h = canvasHeight * 0.90;
      w = h * targetAspect;
    }

    this.playfield.scale = w / 512;
    this.playfield.width = w;
    this.playfield.height = h;
    this.playfield.x = (canvasWidth - w) / 2;
    this.playfield.y = (canvasHeight - h) / 2;
  }

  toScreenX(osuX) {
    return this.playfield.x + osuX * this.playfield.scale;
  }

  toScreenY(osuY) {
    return this.playfield.y + osuY * this.playfield.scale;
  }

  toOsuX(screenX) {
    return (screenX - this.playfield.x) / this.playfield.scale;
  }

  toOsuY(screenY) {
    return (screenY - this.playfield.y) / this.playfield.scale;
  }

  update(deltaTimeMs) {
    if (!this.isRunning || this.isPaused || this.isFailed || !this.beatmap) return;

    this.currentTime = this.audio.getCurrentTimeMs();
    const objects = this.beatmap.hitObjects;
    if (!objects || objects.length === 0) return;

    // Autoplay Bot Logic: updates pointer & executes perfect hits
    if (this.isAuto) {
      this.hp = 1.0;
      this._updateAutoplay();
    }

    // Check hit objects expiry & misses
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (obj.judged) continue;

      // Circles: timeout miss
      if (obj.objectType === "circle") {
        if (this.currentTime > obj.time + this.hit50) {
          if (this.isAuto) {
            this._applyJudgement(obj, 300, obj.x, obj.y);
          } else {
            this._applyJudgement(obj, 0, obj.x, obj.y);
          }
        }
      }

      // Sliders: track progress
      else if (obj.objectType === "slider") {
        if (this.currentTime >= obj.time && this.currentTime <= obj.endTime) {
          const duration = obj.duration || 500;
          const elapsed = this.currentTime - obj.time;
          let progress = elapsed / duration;
          if (progress > 1) progress = 1;

          const spanCount = obj.repeat || 1;
          const currentSpan = Math.floor(progress * spanCount);
          let spanProgress = (progress * spanCount) % 1;
          if (currentSpan % 2 === 1) spanProgress = 1 - spanProgress;

          obj.sliderProgress = spanProgress;

          if (typeof SliderCalculator !== "undefined" && obj.samples) {
            const ballPos = SliderCalculator.getPositionAtProgress(obj.samples, obj.pixelLength, spanProgress);
            const followRadius = this.circleRadius * 2.5;
            let isTracked = false;

            if (this.isAuto) {
              isTracked = true;
              this.pointer.x = ballPos.x;
              this.pointer.y = ballPos.y;
              this.pointer.isDown = true;
            } else {
              if (this.pointer.isDown && Math.hypot(this.pointer.x - ballPos.x, this.pointer.y - ballPos.y) <= followRadius) {
                isTracked = true;
              }
              for (const [_, pt] of this.activeTouches.entries()) {
                if (Math.hypot(pt.x - ballPos.x, pt.y - ballPos.y) <= followRadius) {
                  isTracked = true;
                  break;
                }
              }
            }
            obj.isTracking = isTracked;
          }
        } else if (this.currentTime > obj.endTime + this.hit50) {
          const result = (obj.isTracking || this.isAuto) ? 300 : (obj.result !== null ? obj.result : 100);
          this._applyJudgement(obj, result, obj.x, obj.y);
        }
      }

      // Spinners
      else if (obj.objectType === "spinner") {
        if (this.currentTime > obj.endTime) {
          const res = (this.isAuto || obj.rotations >= obj.requiredRotations) ? 300 : (obj.rotations >= obj.requiredRotations * 0.5 ? 100 : 0);
          this._applyJudgement(obj, res, 256, 192);
        }
      }
    }

    // Accurate HP drain logic:
    // 1. Never drains during intro (before first note) or outro
    // 2. Never drains during map break sections
    // 3. Gentle passive drain capped at 0.05 (can NEVER kill on its own; only MISSES cause failure)
    // 4. Auto and NoFail permanently stay at 1.0
    if (this.isAuto || this.isNoFail) {
      this.hp = 1.0;
    } else {
      const firstObj = objects[0];
      const lastObj = objects[objects.length - 1];

      if (firstObj && lastObj && this.currentTime >= firstObj.time && this.currentTime <= lastObj.endTime) {
        let inBreak = false;
        if (this.beatmap && this.beatmap.breaks) {
          for (const brk of this.beatmap.breaks) {
            if (this.currentTime >= brk.startTime && this.currentTime <= brk.endTime) {
              inBreak = true;
              break;
            }
          }
        }

        if (!inBreak) {
          const hpStat = (this.beatmap && this.beatmap.difficulty && this.beatmap.difficulty.HPDrainRate) || 4;
          const hrMult = this.isHardRock ? 1.4 : 1.0;
          const drainRate = 0.000012 * (hpStat / 5) * hrMult * deltaTimeMs;
          this.hp = Math.max(0.05, this.hp - drainRate);
        }
      }
    }

    // Update floating hit bursts
    for (let i = this.hitBursts.length - 1; i >= 0; i--) {
      const b = this.hitBursts[i];
      b.life -= deltaTimeMs / 600;
      b.y -= 0.5;
      if (b.life <= 0) {
        this.hitBursts.splice(i, 1);
      }
    }

    // Notify stats
    if (this.onStatsUpdate) {
      this.onStatsUpdate({
        score: this.score,
        combo: this.combo,
        accuracy: this.getAccuracy(),
        hp: this.hp,
      });
    }

    // Check if beatmap finished
    const lastObj = objects[objects.length - 1];
    if (lastObj && this.currentTime > lastObj.endTime + 1200) {
      this.stop();
      if (this.onGameEnd) {
        this.onGameEnd(this.getFinalResults());
      }
    }
  }

  _updateAutoplay() {
    const objects = this.beatmap.hitObjects;
    this.hp = 1.0;

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (obj.judged) continue;

      if (obj.objectType === "circle") {
        if (this.currentTime >= obj.time) {
          this.pointer.x = obj.x;
          this.pointer.y = obj.y;
          this.pointer.isDown = true;
          this._applyJudgement(obj, 300, obj.x, obj.y);
          this.audio.playHitSound(obj.hitSound);
          setTimeout(() => { if (this.isAuto) this.pointer.isDown = false; }, 35);
        } else if (this.currentTime >= obj.time - 220) {
          const t = (this.currentTime - (obj.time - 220)) / 220;
          this.pointer.x += (obj.x - this.pointer.x) * t * 0.45;
          this.pointer.y += (obj.y - this.pointer.y) * t * 0.45;
          break;
        } else {
          break;
        }
      } else if (obj.objectType === "slider") {
        if (this.currentTime < obj.time) {
          if (this.currentTime >= obj.time - 220) {
            const t = (this.currentTime - (obj.time - 220)) / 220;
            this.pointer.x += (obj.x - this.pointer.x) * t * 0.45;
            this.pointer.y += (obj.y - this.pointer.y) * t * 0.45;
          }
          break;
        } else if (this.currentTime >= obj.time && this.currentTime <= obj.endTime) {
          obj.isTracking = true;
          this.pointer.isDown = true;
          if (obj.samples && typeof SliderCalculator !== "undefined") {
            const ballPos = SliderCalculator.getPositionAtProgress(obj.samples, obj.pixelLength, obj.sliderProgress || 0);
            this.pointer.x = ballPos.x;
            this.pointer.y = ballPos.y;
          } else {
            this.pointer.x = obj.x;
            this.pointer.y = obj.y;
          }
        } else if (this.currentTime > obj.endTime) {
          if (!obj.judged) {
            this._applyJudgement(obj, 300, obj.x, obj.y);
            this.audio.playHitSound(obj.hitSound);
          }
        }
      } else if (obj.objectType === "spinner") {
        if (this.currentTime >= obj.time && this.currentTime <= obj.endTime) {
          const ang = (this.currentTime / 50) * Math.PI * 2;
          this.pointer.x = 256 + Math.cos(ang) * 55;
          this.pointer.y = 192 + Math.sin(ang) * 55;
          this.pointer.isDown = true;
          obj.rotations += 0.35;
        } else if (this.currentTime > obj.endTime) {
          if (!obj.judged) {
            this._applyJudgement(obj, 300, 256, 192);
          }
        }
        break;
      }
    }
  }

  handlePointerDown(id, screenX, screenY) {
    if (!this.isRunning || this.isPaused || this.isFailed || !this.beatmap || this.isAuto) return;

    const osuX = this.toOsuX(screenX);
    const osuY = this.toOsuY(screenY);
    this.pointer.x = osuX;
    this.pointer.y = osuY;
    this.pointer.isDown = true;
    this.activeTouches.set(id || "mouse", { x: osuX, y: osuY });

    this._tryHitAt(osuX, osuY);
  }

  handlePointerMove(id, screenX, screenY) {
    if (this.isAuto) return;
    const osuX = this.toOsuX(screenX);
    const osuY = this.toOsuY(screenY);
    this.pointer.x = osuX;
    this.pointer.y = osuY;
    const key = id || "mouse";
    if (this.activeTouches.has(key)) {
      this.activeTouches.set(key, { x: osuX, y: osuY });
    }
  }

  handlePointerUp(id) {
    if (this.isAuto) return;
    const key = id || "mouse";
    this.activeTouches.delete(key);
    if (this.activeTouches.size === 0) {
      this.pointer.isDown = false;
    }
  }

  _tryHitAt(x, y) {
    const objects = this.beatmap.hitObjects;

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (obj.judged) continue;

      const timeDiff = Math.abs(this.currentTime - obj.time);
      if (timeDiff > this.hit50) continue;

      const dist = Math.hypot(x - obj.x, y - obj.y);
      if (dist <= this.circleRadius * 1.35) {
        let result = 0;
        if (timeDiff <= this.hit300) result = 300;
        else if (timeDiff <= this.hit100) result = 100;
        else if (timeDiff <= this.hit50) result = 50;

        if (obj.objectType === "circle") {
          this._applyJudgement(obj, result, obj.x, obj.y);
          this.audio.playHitSound(obj.hitSound);
          return;
        } else if (obj.objectType === "slider") {
          obj.isTracking = true;
          this.audio.playHitSound(obj.hitSound);
          return;
        }
      }
    }
  }

  _applyJudgement(obj, result, hitX, hitY) {
    obj.judged = true;
    obj.result = result;

    if (result > 0) {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      const comboMult = Math.max(1, this.combo - 1);
      this.score += result + Math.floor(result * comboMult * 0.05);

      if (result === 300) {
        this.count300++;
        this.hp = Math.min(1.0, this.hp + 0.05);
      } else if (result === 100) {
        this.count100++;
        this.hp = Math.min(1.0, this.hp + 0.02);
      } else if (result === 50) {
        this.count50++;
        this.hp = Math.min(1.0, this.hp + 0.005);
      }
    } else {
      // Miss
      this.countMiss++;
      if (this.combo >= 15) {
        this.audio.playComboBreak();
      }
      this.combo = 0;

      if (!this.isNoFail && !this.isAuto) {
        const missPenalty = this.isHardRock ? 0.14 : 0.09;
        this.hp -= missPenalty;
        if (this.hp <= 0) {
          this.hp = 0;
          this._triggerFail();
          return;
        }
      }
    }

    this.hitBursts.push({
      x: hitX,
      y: hitY,
      result: result,
      life: 1.0,
    });
  }

  getAccuracy() {
    const totalHits = this.count300 + this.count100 + this.count50 + this.countMiss;
    if (totalHits === 0) return 100.0;
    const weighted = this.count300 * 300 + this.count100 * 100 + this.count50 * 50;
    return (weighted / (totalHits * 300)) * 100;
  }

  getGrade(acc, countMiss) {
    if (acc === 100) return "SS";
    if (acc >= 95 && countMiss === 0) return "S";
    if (acc >= 90) return "A";
    if (acc >= 80) return "B";
    if (acc >= 70) return "C";
    return "D";
  }

  getFinalResults() {
    const acc = this.getAccuracy();
    return {
      title: this.beatmap.metadata.Title,
      artist: this.beatmap.metadata.Artist,
      version: this.beatmap.metadata.Version,
      score: this.score,
      maxCombo: this.maxCombo,
      accuracy: acc.toFixed(2),
      grade: this.getGrade(acc, this.countMiss),
      count300: this.count300,
      count100: this.count100,
      count50: this.count50,
      countMiss: this.countMiss,
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = GameplayEngine;
}
