/**
 * =====================================================================
 *  osu! Beatmap Parser (.osu format parser)
 *  Parses raw .osu text into a structured Beatmap object with accurate
 *  events (background, video, breaks), timing points, slider velocity multipliers,
 *  and curve geometries.
 * =====================================================================
 */

class BeatmapParser {
  static parse(rawText) {
    if (!rawText) return null;
    // Strip UTF-8 BOM if present
    const cleanText = rawText.replace(/^\uFEFF/, "");
    const lines = cleanText.split(/\r?\n/);

    const beatmap = {
      formatVersion: 14,
      general: {
        AudioFilename: "",
        AudioLeadIn: 0,
        PreviewTime: -1,
        Countdown: 0,
        SampleSet: "Normal",
        StackLeniency: 0.7,
        Mode: 0, // 0 = osu!std
      },
      metadata: {
        Title: "Unknown Title",
        TitleUnicode: "",
        Artist: "Unknown Artist",
        ArtistUnicode: "",
        Creator: "Unknown Creator",
        Version: "Normal",
        Source: "",
        Tags: "",
        BeatmapID: 0,
        BeatmapSetID: -1,
      },
      difficulty: {
        HPDrainRate: 5,
        CircleSize: 4,
        OverallDifficulty: 5,
        ApproachRate: 5,
        SliderMultiplier: 1.4,
        SliderTickRate: 1,
      },
      events: {
        background: "",
        video: "",
      },
      breaks: [],
      timingPoints: [],
      hitObjects: [],
      comboColours: [
        [255, 102, 171], // Magenta / Pink
        [0, 229, 255],   // Cyan
        [255, 214, 0],   // Gold
        [0, 230, 118]    // Green
      ]
    };

    let currentSection = "";

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line || line.startsWith("//")) continue;

      if (line.startsWith("osu file format v")) {
        beatmap.formatVersion = parseInt(line.replace("osu file format v", "").trim(), 10) || 14;
        continue;
      }

      if (line.startsWith("[") && line.endsWith("]")) {
        currentSection = line.substring(1, line.length - 1).trim();
        continue;
      }

      switch (currentSection) {
        case "General": {
          const [key, val] = this._parseKeyValue(line);
          if (key) {
            if (["AudioLeadIn", "PreviewTime", "Countdown", "Mode"].includes(key)) {
              beatmap.general[key] = parseInt(val, 10) || 0;
            } else if (key === "StackLeniency") {
              beatmap.general[key] = parseFloat(val);
            } else {
              beatmap.general[key] = val;
            }
          }
          break;
        }

        case "Metadata": {
          const [key, val] = this._parseKeyValue(line);
          if (key) {
            if (["BeatmapID", "BeatmapSetID"].includes(key)) {
              beatmap.metadata[key] = parseInt(val, 10);
            } else {
              beatmap.metadata[key] = val;
            }
          }
          break;
        }

        case "Difficulty": {
          const [key, val] = this._parseKeyValue(line);
          if (key) {
            beatmap.difficulty[key] = parseFloat(val);
          }
          break;
        }

        case "Events": {
          // Format 1: 0, 0, "filename.jpg", xOffset, yOffset (Background)
          // Format 2: Video, 0, "video.mp4"
          // Format 3: 2, startTime, endTime (Break period)
          const parts = line.split(",");
          if (parts.length >= 3) {
            const eventType = parts[0].trim();
            if (eventType === "0" || eventType === "Background") {
              let filename = parts[2].trim();
              if (filename.startsWith('"') && filename.endsWith('"')) {
                filename = filename.substring(1, filename.length - 1);
              }
              if (filename && !beatmap.events.background) {
                beatmap.events.background = filename;
              }
            } else if (eventType === "2" || eventType === "Break") {
              const start = parseFloat(parts[1]);
              const end = parseFloat(parts[2]);
              if (!isNaN(start) && !isNaN(end)) {
                beatmap.breaks.push({ startTime: start, endTime: end });
              }
            }
          }
          break;
        }

        case "TimingPoints": {
          // Format: time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
          const parts = line.split(",");
          if (parts.length >= 2) {
            const time = parseFloat(parts[0]);
            const beatLength = parseFloat(parts[1]);
            const meter = parts[2] ? parseInt(parts[2], 10) : 4;
            const uninherited = parts.length > 6 ? parseInt(parts[6], 10) === 1 : (beatLength > 0);
            beatmap.timingPoints.push({
              time,
              beatLength,
              meter,
              uninherited,
              bpm: uninherited && beatLength > 0 ? (60000 / beatLength) : null
            });
          }
          break;
        }

        case "HitObjects": {
          const obj = this._parseHitObject(line, beatmap.difficulty);
          if (obj) {
            beatmap.hitObjects.push(obj);
          }
          break;
        }
      }
    }

    // Sort objects and timing points by time
    beatmap.hitObjects.sort((a, b) => a.time - b.time);
    beatmap.timingPoints.sort((a, b) => a.time - b.time);

    // Resolve accurate slider durations based on timing points
    this._resolveSliderTiming(beatmap);

    // Assign combo index and numbering
    let comboNumber = 1;
    let comboColorIndex = 0;

    for (let i = 0; i < beatmap.hitObjects.length; i++) {
      const obj = beatmap.hitObjects[i];
      if (obj.isNewCombo || i === 0) {
        comboNumber = 1;
        comboColorIndex = (comboColorIndex + 1 + (obj.comboColorOffset || 0)) % beatmap.comboColours.length;
      }
      obj.comboNumber = comboNumber++;
      obj.color = beatmap.comboColours[comboColorIndex];
    }

    return beatmap;
  }

  static _parseKeyValue(line) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) return [null, null];
    const key = line.substring(0, colonIdx).trim();
    const val = line.substring(colonIdx + 1).trim();
    return [key, val];
  }

  static _resolveSliderTiming(beatmap) {
    const timingPoints = beatmap.timingPoints;
    let defaultBeatLength = 500;
    if (timingPoints.length > 0 && timingPoints[0].uninherited && timingPoints[0].beatLength > 0) {
      defaultBeatLength = timingPoints[0].beatLength;
    }
    const sliderMultiplier = beatmap.difficulty.SliderMultiplier || 1.4;

    for (const obj of beatmap.hitObjects) {
      if (obj.objectType === "slider") {
        let parentBeatLength = defaultBeatLength;
        for (let i = 0; i < timingPoints.length; i++) {
          const tp = timingPoints[i];
          if (tp.time <= obj.time && tp.uninherited && tp.beatLength > 0) {
            parentBeatLength = tp.beatLength;
          } else if (tp.time > obj.time) {
            break;
          }
        }

        let svMultiplier = 1.0;
        for (let i = 0; i < timingPoints.length; i++) {
          const tp = timingPoints[i];
          if (tp.time <= obj.time) {
            if (!tp.uninherited && tp.beatLength < 0) {
              svMultiplier = Math.max(0.1, Math.min(10.0, -100 / tp.beatLength));
            } else if (tp.uninherited) {
              svMultiplier = 1.0;
            }
          } else {
            break;
          }
        }

        const velocity = sliderMultiplier * 100 * svMultiplier;
        const beats = obj.pixelLength / velocity;
        const spanDuration = beats * parentBeatLength;
        const totalDuration = spanDuration * (obj.repeat || 1);

        obj.duration = Math.max(50, totalDuration);
        obj.endTime = obj.time + obj.duration;
      }
    }
  }

  static _parseHitObject(line, difficulty) {
    // Format: x,y,time,type,hitSound,objectParams...
    const parts = line.split(",");
    if (parts.length < 4) return null;

    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    const time = parseInt(parts[2], 10);
    const type = parseInt(parts[3], 10);
    const hitSound = parseInt(parts[4], 10) || 0;

    const isCircle = (type & 1) !== 0;
    const isSlider = (type & 2) !== 0;
    const isNewCombo = (type & 4) !== 0;
    const isSpinner = (type & 8) !== 0;
    const comboColorOffset = (type >> 4) & 7;

    const baseObj = {
      x,
      y,
      time,
      type,
      hitSound,
      isNewCombo,
      comboColorOffset,
      judged: false,
      result: null, // 300, 100, 50, 0
    };

    if (isSlider && parts.length >= 6) {
      baseObj.objectType = "slider";
      // Slider format: curveType|x1:y1|x2:y2...,repeat,pixelLength
      const curveData = parts[5].split("|");
      let curveType = "B";
      let startIdx = 0;

      if (curveData[0] && curveData[0].length === 1 && "BCLP".includes(curveData[0].toUpperCase())) {
        curveType = curveData[0].toUpperCase();
        startIdx = 1;
      }

      const curvePoints = [{ x, y }];
      for (let i = startIdx; i < curveData.length; i++) {
        const pt = curveData[i].split(":");
        if (pt.length === 2) {
          const px = parseInt(pt[0], 10);
          const py = parseInt(pt[1], 10);
          if (!isNaN(px) && !isNaN(py)) {
            curvePoints.push({ x: px, y: py });
          }
        }
      }

      const repeat = parts.length > 6 ? (parseInt(parts[6], 10) || 1) : 1;
      const pixelLength = parts.length > 7 ? (parseFloat(parts[7]) || 100) : 100;

      baseObj.curveType = curveType;
      baseObj.curvePoints = curvePoints;
      baseObj.repeat = repeat;
      baseObj.pixelLength = pixelLength;
      baseObj.duration = 500; // Will be accurately resolved in _resolveSliderTiming
      baseObj.endTime = time + 500;
      baseObj.sliderProgress = 0;
      baseObj.isTracking = false;

      return baseObj;
    }

    if (isSpinner && parts.length >= 5) {
      baseObj.objectType = "spinner";
      const endTime = parts.length >= 6 ? (parseInt(parts[5], 10) || time + 1000) : (time + 1000);
      baseObj.endTime = endTime;
      baseObj.duration = endTime - time;
      baseObj.rotations = 0;
      baseObj.requiredRotations = Math.max(2, Math.floor(baseObj.duration / 400));
      return baseObj;
    }

    if (isCircle || parts.length >= 4) {
      baseObj.objectType = "circle";
      baseObj.endTime = time;
      return baseObj;
    }

    return null;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = BeatmapParser;
}
