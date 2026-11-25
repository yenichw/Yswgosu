/**
 * =====================================================================
 *  Yswgosu / osu! Canvas 2D Hardware-Accelerated Renderer
 *  Renders circles, approach rings, sliders, bursts, and authentic osu! cursor.
 * =====================================================================
 */

class GameRenderer {
  constructor(canvas, gameplayEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.game = gameplayEngine;

    this.dpr = window.devicePixelRatio || 1;
    this.cursorTrail = [];
    this.maxTrailLength = 16;
    this.rippleTime = 0;

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
  }

  render(currentTime) {
    const ctx = this.ctx;
    if (!ctx || !this.game || !this.game.activeDiff) return;

    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    // Clear Screen (deep dark background)
    ctx.fillStyle = "#0c0d14";
    ctx.fillRect(0, 0, width, height);

    const hitObjects = this.game.activeDiff.hitObjects || [];
    const radius = this.game.hitCircleRadius;
    const approachTime = this.game.approachTime;

    // Render Hit Objects (Reverse Order: farthest in future drawn first, nearest on top)
    for (let i = hitObjects.length - 1; i >= 0; i--) {
      const obj = hitObjects[i];

      // Check visibility window: visible from (obj.time - approachTime) until (obj.endTime + 200ms)
      const objEnd = obj.endTime || obj.time;
      if (currentTime < obj.time - approachTime || currentTime > objEnd + 250) {
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

      // Render Approach Circle (only before object time)
      if (currentTime < obj.time) {
        const timeRemaining = obj.time - currentTime;
        const progress = Math.max(0, timeRemaining / approachTime);
        const approachRadius = radius * (1 + progress * 2.2);
        this._drawApproachCircle(ctx, screenX, screenY, approachRadius, obj.color);
      }
    }

    // Render Hit Bursts (300, 100, 50, Miss)
    this._drawHitBursts(ctx);

    // Render Authentic osu! Cursor & Trail
    this._drawCursor(ctx);
  }

  _drawHitCircle(ctx, x, y, radius, color, number) {
    const [r, g, b] = color || [255, 102, 171];

    ctx.save();

    // Circle Body Gradient
    const grad = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.25, radius * 0.1, x, y, radius);
    grad.addColorStop(0, `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, 0.95)`);
    grad.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, 0.9)`);
    grad.addColorStop(1, `rgba(${Math.max(0, r - 50)}, ${Math.max(0, g - 50)}, ${Math.max(0, b - 50)}, 0.95)`);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // White Outer Border
    ctx.lineWidth = Math.max(3, radius * 0.12);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.stroke();

    // Subtle Outer Glow
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
    ctx.stroke();

    // Combo Number
    if (number !== undefined) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.floor(radius * 0.9)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
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
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.restore();
  }

  _drawSliderBody(ctx, obj, radius) {
    if (!obj.samples || obj.samples.length < 2) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 1. Outer Border
    ctx.beginPath();
    const first = obj.samples[0];
    ctx.moveTo(this.game.toScreenX(first.x), this.game.toScreenY(first.y));
    for (let i = 1; i < obj.samples.length; i++) {
      const p = obj.samples[i];
      ctx.lineTo(this.game.toScreenX(p.x), this.game.toScreenY(p.y));
    }
    ctx.lineWidth = radius * 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.stroke();

    // 2. Inner Track Fill
    ctx.beginPath();
    ctx.moveTo(this.game.toScreenX(first.x), this.game.toScreenY(first.y));
    for (let i = 1; i < obj.samples.length; i++) {
      const p = obj.samples[i];
      ctx.lineTo(this.game.toScreenX(p.x), this.game.toScreenY(p.y));
    }
    ctx.lineWidth = radius * 1.7;
    const [r, g, b] = obj.color || [100, 100, 100];
    ctx.strokeStyle = `rgba(${Math.floor(r * 0.4)}, ${Math.floor(g * 0.4)}, ${Math.floor(b * 0.4)}, 0.8)`;
    ctx.stroke();

    // 3. Slider Ball (if currently active)
    const now = this.game.audio.getCurrentTimeMs();
    if (now >= obj.time && now <= obj.endTime) {
      const ballPos = this.game.getSliderPosition(obj, now);
      if (ballPos) {
        const bx = this.game.toScreenX(ballPos.x);
        const by = this.game.toScreenY(ballPos.y);

        ctx.beginPath();
        ctx.arc(bx, by, radius * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.fill();

        // Follow Ring
        ctx.beginPath();
        ctx.arc(bx, by, radius * 1.8, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255, 204, 0, 0.85)";
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  _drawHitBursts(ctx) {
    if (!this.game.hitBursts || this.game.hitBursts.length === 0) return;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const b of this.game.hitBursts) {
      const x = this.game.toScreenX(b.x);
      const y = this.game.toScreenY(b.y) - (1 - b.alpha) * 35; // gentle float upward
      const alpha = Math.max(0, b.alpha);

      if (b.result === 300) {
        ctx.fillStyle = `rgba(0, 229, 255, ${alpha})`;
        ctx.font = "bold 24px sans-serif";
        ctx.fillText("300", x, y);
      } else if (b.result === 100) {
        ctx.fillStyle = `rgba(0, 230, 118, ${alpha})`;
        ctx.font = "bold 20px sans-serif";
        ctx.fillText("100", x, y);
      } else if (b.result === 50) {
        ctx.fillStyle = `rgba(255, 145, 0, ${alpha})`;
        ctx.font = "bold 16px sans-serif";
        ctx.fillText("50", x, y);
      } else {
        ctx.fillStyle = `rgba(255, 23, 68, ${alpha})`;
        ctx.font = "bold 26px sans-serif";
        ctx.fillText("✕", x, y);
      }
    }
    ctx.restore();
  }

  _drawCursor(ctx) {
    const curX = this.game.toScreenX(this.game.pointer.x);
    const curY = this.game.toScreenY(this.game.pointer.y);
    const isDown = this.game.pointer.down;

    this.cursorTrail.push({ x: curX, y: curY, time: performance.now() });
    if (this.cursorTrail.length > this.maxTrailLength) {
      this.cursorTrail.shift();
    }

    ctx.save();

    // 1. Smooth fading cursor trail
    const now = performance.now();
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
