/**
 * =====================================================================
 *  Yswgosu / osu! Canvas 2D Hardware-Accelerated Renderer
 *  Renders beatmap background, sleek playfield bounds, sliders with
 *  tracking balls, hit circles with combo numbers & approach rings,
 *  hit bursts, countdown (3-2-1-GO), and authentic osu! cursor.
 * =====================================================================
 */

class GameRenderer {
  constructor(canvas, gameplayEngine) {
    this.canvas = canvas;
    this.ctx = canvas && canvas.getContext ? canvas.getContext("2d", { alpha: false }) : null;
    this.game = gameplayEngine;

    this.dpr = window.devicePixelRatio || 1;
    this.cursorTrail = [];
    this.maxTrailLength = 16;
    this.bgImageCache = new Map();

    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    this.dpr = window.devicePixelRatio || 1;
    let width = window.innerWidth;
    let height = window.innerHeight;

    if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        width = rect.width;
        height = rect.height;
      }
      this.canvas.width = Math.floor(width * this.dpr);
      this.canvas.height = Math.floor(height * this.dpr);
    }

    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(this.dpr, this.dpr);
    }

    if (this.game) {
      this.game.updatePlayfieldBounds(width, height);
    }
  }

  render() {
    if (!this.canvas || !this.ctx) return;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    const ctx = this.ctx;

    // 1. Draw Background (dimmed beatmap wallpaper or dark gradient)
    this._drawBackground(ctx, width, height);

    // 2. Draw Playfield Boundary
    if (this.game && this.game.playfield) {
      ctx.save();
      const pf = this.game.playfield;
      ctx.strokeStyle = this.game.isHardRock ? "rgba(255, 23, 68, 0.45)" : "rgba(255, 102, 171, 0.22)";
      ctx.lineWidth = 2;
      ctx.strokeRect(pf.x, pf.y, pf.width, pf.height);
      ctx.restore();
    }

    if (!this.game || !this.game.beatmap) {
      this._drawCursor(ctx);
      return;
    }

    const currentTime = this.game.currentTime;
    const approachTime = this.game.approachTime;
    const radius = this.game.circleRadius * this.game.playfield.scale;

    // 3. Draw Hit Objects (reverse order: future drawn first, immediate on top)
    const objects = this.game.beatmap.hitObjects || [];

    // Find visible objects that need approach circles (limit to nearest 2 to avoid clutter)
    const upcomingIndices = [];
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!obj.judged && currentTime < obj.time && (obj.time - currentTime) <= approachTime) {
        upcomingIndices.push(i);
        if (upcomingIndices.length >= 2) break;
      }
    }

    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];

      // Visibility window
      if (currentTime < obj.time - approachTime || currentTime > obj.endTime + this.game.hit50) {
        continue;
      }
      if (obj.judged && obj.objectType === "circle") continue;

      const screenX = this.game.toScreenX(obj.x);
      const screenY = this.game.toScreenY(obj.y);

      // Render Slider Body
      if (obj.objectType === "slider" && obj.samples) {
        this._drawSliderBody(ctx, obj, radius);
      }

      // Render Hit Circle
      if (!obj.judged || obj.objectType === "slider") {
        this._drawHitCircle(ctx, screenX, screenY, radius, obj.color, obj.comboNumber);
      }

      // Render Approach Circle (only for closest upcoming notes)
      if (upcomingIndices.includes(i) && currentTime < obj.time) {
        const timeRemaining = obj.time - currentTime;
        const progress = Math.max(0, timeRemaining / approachTime);
        const approachRadius = radius * (1 + progress * 2.2);
        this._drawApproachCircle(ctx, screenX, screenY, approachRadius, obj.color);
      }
    }

    // 4. Render Hit Bursts (300, 100, 50, Miss)
    this._drawHitBursts(ctx);

    // 5. Render Countdown Overlay (3, 2, 1, GO)
    if (this.game.countdownText) {
      this._drawCountdown(ctx, width, height, this.game.countdownText, this.game.countdownProgress || 1);
    }

    // 6. Render Authentic osu! Cursor & Trail
    this._drawCursor(ctx);
  }

  _drawBackground(ctx, width, height) {
    const bgUrl = this.game && this.game.beatmap && this.game.beatmap._bgUrl;
    if (bgUrl) {
      let img = this.bgImageCache.get(bgUrl);
      if (!img) {
        img = new Image();
        img.src = bgUrl;
        this.bgImageCache.set(bgUrl, img);
      }

      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const screenAspect = width / height;
        let drawW, drawH, drawX, drawY;

        if (screenAspect > imgAspect) {
          drawW = width;
          drawH = width / imgAspect;
          drawX = 0;
          drawY = (height - drawH) / 2;
        } else {
          drawH = height;
          drawW = height * imgAspect;
          drawX = (width - drawW) / 2;
          drawY = 0;
        }

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        // Dim overlay (75% darkness for perfect circle visibility)
        ctx.fillStyle = "rgba(10, 6, 16, 0.78)";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        return;
      }
    }

    // Fallback: Rich dark gradient
    const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) * 0.75);
    grad.addColorStop(0, "#191026");
    grad.addColorStop(1, "#0a0610");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  _drawHitCircle(ctx, x, y, radius, color, number) {
    const [r, g, b] = color || [255, 102, 171];

    ctx.save();

    // Circle Body Gradient
    const grad = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.25, radius * 0.1, x, y, radius);
    grad.addColorStop(0, `rgba(${Math.min(255, r + 45)}, ${Math.min(255, g + 45)}, ${Math.min(255, b + 45)}, 0.96)`);
    grad.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, 0.92)`);
    grad.addColorStop(1, `rgba(${Math.max(0, r - 55)}, ${Math.max(0, g - 55)}, ${Math.max(0, b - 55)}, 0.96)`);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // White Outer Border
    ctx.lineWidth = Math.max(3, radius * 0.12);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.stroke();

    // Outer Glow
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.65)`;
    ctx.stroke();

    // Combo Number
    if (number !== undefined) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.floor(radius * 0.88)}px 'Torus', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
      ctx.shadowBlur = 4;
      ctx.fillText(number.toString(), x, y);
    }

    ctx.restore();
  }

  _drawApproachCircle(ctx, x, y, radius, color) {
    const [r, g, b] = color || [255, 255, 255];
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  _drawSliderBody(ctx, slider, radius) {
    if (!slider.samples || slider.samples.length < 2) return;

    const [r, g, b] = slider.color || [255, 102, 171];
    const samples = slider.samples;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 1. Outer border path (white)
    ctx.beginPath();
    ctx.moveTo(this.game.toScreenX(samples[0].x), this.game.toScreenY(samples[0].y));
    for (let i = 1; i < samples.length; i++) {
      ctx.lineTo(this.game.toScreenX(samples[i].x), this.game.toScreenY(samples[i].y));
    }
    ctx.lineWidth = radius * 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
    ctx.stroke();

    // 2. Inner track body (colored glow)
    ctx.lineWidth = radius * 1.7;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
    ctx.stroke();

    // 3. Dark center track
    ctx.lineWidth = radius * 1.35;
    ctx.strokeStyle = "rgba(16, 10, 24, 0.75)";
    ctx.stroke();

    // 4. Slider Ball & Tracking Ring
    if (slider.sliderProgress !== undefined && slider.sliderProgress >= 0) {
      if (typeof SliderCalculator !== "undefined") {
        const ballPos = SliderCalculator.getPositionAtProgress(samples, slider.pixelLength, slider.sliderProgress);
        const bx = this.game.toScreenX(ballPos.x);
        const by = this.game.toScreenY(ballPos.y);

        // Slider Ball
        ctx.beginPath();
        ctx.arc(bx, by, radius * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = slider.isTracking ? "#ffffff" : `rgb(${r}, ${g}, ${b})`;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.9)`;
        ctx.shadowBlur = 10;
        ctx.fill();

        // Follow Circle (pulsing ring)
        if (slider.isTracking) {
          ctx.beginPath();
          ctx.arc(bx, by, radius * 1.85, 0, Math.PI * 2);
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
          ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
          ctx.shadowBlur = 12;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  _drawHitBursts(ctx) {
    if (!this.game || !this.game.hitBursts) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const b of this.game.hitBursts) {
      const x = this.game.toScreenX(b.x);
      const y = this.game.toScreenY(b.y);
      const alpha = Math.max(0, b.life);

      if (b.result === 300) {
        ctx.fillStyle = `rgba(0, 229, 255, ${alpha})`;
        ctx.font = "bold 26px 'Torus', sans-serif";
        ctx.shadowColor = "rgba(0, 229, 255, 0.8)";
        ctx.shadowBlur = 10;
        ctx.fillText("300", x, y);
      } else if (b.result === 100) {
        ctx.fillStyle = `rgba(0, 230, 118, ${alpha})`;
        ctx.font = "bold 22px 'Torus', sans-serif";
        ctx.shadowColor = "rgba(0, 230, 118, 0.8)";
        ctx.shadowBlur = 8;
        ctx.fillText("100", x, y);
      } else if (b.result === 50) {
        ctx.fillStyle = `rgba(255, 145, 0, ${alpha})`;
        ctx.font = "bold 18px 'Torus', sans-serif";
        ctx.shadowColor = "rgba(255, 145, 0, 0.8)";
        ctx.shadowBlur = 6;
        ctx.fillText("50", x, y);
      } else {
        ctx.fillStyle = `rgba(255, 23, 68, ${alpha})`;
        ctx.font = "bold 30px 'Torus', sans-serif";
        ctx.shadowColor = "rgba(255, 23, 68, 0.8)";
        ctx.shadowBlur = 10;
        ctx.fillText("✕", x, y);
      }
    }
    ctx.restore();
  }

  _drawCountdown(ctx, width, height, text, progress) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const scale = 1.3 - progress * 0.3;
    const alpha = Math.max(0, progress);

    ctx.font = `900 ${Math.floor(90 * scale)}px 'Torus', sans-serif`;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.shadowColor = "rgba(255, 102, 171, 0.9)";
    ctx.shadowBlur = 24;
    ctx.fillText(text, width / 2, height / 2);
    ctx.restore();
  }

  _drawCursor(ctx) {
    if (!this.game || !this.game.pointer) return;
    const curX = this.game.toScreenX(this.game.pointer.x);
    const curY = this.game.toScreenY(this.game.pointer.y);
    const isDown = this.game.pointer.down;

    const now = performance.now();
    this.cursorTrail.push({ x: curX, y: curY, time: now });
    if (this.cursorTrail.length > this.maxTrailLength) {
      this.cursorTrail.shift();
    }

    ctx.save();

    // 1. Smooth fading cursor trail
    for (let i = 0; i < this.cursorTrail.length; i++) {
      const t = this.cursorTrail[i];
      const age = now - t.time;
      if (age > 260) continue;
      const progress = 1 - (age / 260);
      const trailRadius = 6 + progress * 6;
      const trailAlpha = progress * 0.42;

      ctx.beginPath();
      ctx.arc(t.x, t.y, trailRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 102, 171, ${trailAlpha})`;
      ctx.fill();
    }

    // 2. Click shockwave expanding ripple
    if (isDown) {
      ctx.beginPath();
      ctx.arc(curX, curY, 24, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(255, 102, 171, 0.9)";
      ctx.shadowBlur = 8;
      ctx.stroke();
    }

    // 3. Main osu! Donut Cursor
    const cursorRadius = isDown ? 16 : 13;

    // Glowing outer shadow
    ctx.shadowColor = "rgba(255, 102, 171, 0.95)";
    ctx.shadowBlur = 12;

    // Pink Donut Body
    ctx.beginPath();
    ctx.arc(curX, curY, cursorRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#ff66ab";
    ctx.fill();

    // Crisp white outer ring
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // Center white dot
    ctx.beginPath();
    ctx.arc(curX, curY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.restore();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = GameRenderer;
}
