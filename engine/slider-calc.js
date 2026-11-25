/**
 * =====================================================================
 *  osu! Slider Path & Curve Calculator
 *  Computes points along Linear (L), Circumscribed Circle (P), and Bezier (B) curves.
 * =====================================================================
 */

class SliderCalculator {
  static getCurveSamples(points, curveType, targetLength) {
    if (!points || points.length === 0) return [];
    if (points.length === 1) return [{ x: points[0].x, y: points[0].y, dist: 0 }];

    let rawSamples = [];

    if (curveType === "P" && points.length === 3) {
      // Circumscribed Circle (Pass-through arc)
      rawSamples = this._calcCircleSamples(points[0], points[1], points[2], targetLength);
      if (!rawSamples || rawSamples.length < 2) {
        rawSamples = this._calcBezierSamples(points);
      }
    } else if (curveType === "B" || (curveType === "P" && points.length > 3)) {
      // Bezier curve (multi-segment separated by identical control points)
      rawSamples = this._calcBezierSamples(points);
    } else if (curveType === "L" || points.length === 2) {
      // Linear multi-segments
      rawSamples = this._calcLinearSamples(points);
    } else {
      // Fallback
      rawSamples = this._calcBezierSamples(points);
    }

    // Cumulative distance calculation and trimming to targetLength
    const samples = [];
    let accumulatedDist = 0;

    for (let i = 0; i < rawSamples.length; i++) {
      const p = rawSamples[i];
      if (i > 0) {
        const prev = rawSamples[i - 1];
        const segDist = Math.hypot(p.x - prev.x, p.y - prev.y);
        accumulatedDist += segDist;
      }
      samples.push({ x: p.x, y: p.y, dist: accumulatedDist });

      if (targetLength && accumulatedDist >= targetLength) {
        break;
      }
    }

    return samples;
  }

  /**
   * Circumscribed Circle arc (CurveType 'P' for 3 points)
   */
  static _calcCircleSamples(p1, p2, p3, pixelLength) {
    // Check collinearity using cross product
    const cp = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    if (Math.abs(cp) < 0.001) {
      return null; // Collinear, fallback to linear
    }

    // Midpoints
    const mida = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const midb = { x: (p3.x + p2.x) / 2, y: (p3.y + p2.y) / 2 };

    // Perpendicular normals
    const nora = { x: -(p2.y - p1.y), y: p2.x - p1.x };
    const norb = { x: -(p2.y - p3.y), y: p2.x - p3.x };

    // Intersection des determinant
    const des = norb.x * nora.y - norb.y * nora.x;
    if (Math.abs(des) < 0.0001) return null;

    const u = ((midb.y - mida.y) * nora.x + (mida.x - midb.x) * nora.y) / des;
    const cx = midb.x + norb.x * u;
    const cy = midb.y + norb.y * u;

    const r = Math.hypot(p1.x - cx, p1.y - cy);
    const a1 = Math.atan2(p1.y - cy, p1.x - cx);

    // Direction: cross product determines clockwise or counter-clockwise
    const isCcw = cp > 0;
    const totalAngle = (pixelLength / r) * (isCcw ? 1 : -1);

    const steps = Math.max(12, Math.floor(pixelLength / 6));
    const samples = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = a1 + totalAngle * t;
      samples.push({
        x: cx + r * Math.cos(ang),
        y: cy + r * Math.sin(ang)
      });
    }

    return samples;
  }

  static _calcLinearSamples(points) {
    const samples = [];
    for (let i = 0; i < points.length; i++) {
      samples.push({ x: points[i].x, y: points[i].y });
    }
    return samples;
  }

  static _calcBezierSamples(points) {
    const subSegments = [];
    let currentSegment = [];

    for (let i = 0; i < points.length; i++) {
      currentSegment.push(points[i]);
      if (i < points.length - 1 && points[i].x === points[i + 1].x && points[i].y === points[i + 1].y) {
        subSegments.push(currentSegment);
        currentSegment = [];
        i++; // Skip duplicate
      }
    }
    if (currentSegment.length > 0) {
      subSegments.push(currentSegment);
    }

    const samples = [];
    const stepCount = 30; // Steps per segment

    for (const segment of subSegments) {
      if (segment.length === 1) {
        samples.push(segment[0]);
      } else if (segment.length === 2) {
        samples.push(segment[0], segment[1]);
      } else {
        for (let s = 0; s <= stepCount; s++) {
          const t = s / stepCount;
          samples.push(this._deCasteljau(segment, t));
        }
      }
    }

    return samples;
  }

  static _deCasteljau(points, t) {
    let current = points.map(p => ({ x: p.x, y: p.y }));
    while (current.length > 1) {
      const next = [];
      for (let i = 0; i < current.length - 1; i++) {
        next.push({
          x: (1 - t) * current[i].x + t * current[i + 1].x,
          y: (1 - t) * current[i].y + t * current[i + 1].y
        });
      }
      current = next;
    }
    return current[0];
  }

  /**
   * Evaluates position along slider curve at given progress [0..1]
   */
  static getPositionAtProgress(samples, totalLength, progress) {
    if (!samples || samples.length === 0) return { x: 0, y: 0 };
    if (samples.length === 1 || progress <= 0) return { x: samples[0].x, y: samples[0].y };
    if (progress >= 1) return { x: samples[samples.length - 1].x, y: samples[samples.length - 1].y };

    const targetDist = progress * totalLength;

    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];

      if (targetDist >= a.dist && targetDist <= b.dist) {
        const span = b.dist - a.dist;
        const t = span > 0 ? (targetDist - a.dist) / span : 0;
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t
        };
      }
    }

    return { x: samples[samples.length - 1].x, y: samples[samples.length - 1].y };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SliderCalculator;
}
