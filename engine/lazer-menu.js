/**
 * =====================================================================
 *  osu!lazer (kosu) UI Controller & Particle System
 *  Manages screens, the authentic carousel with difficulty badges,
 *  the Wedge info panel, mods (Auto, NoFail, HardRock), real-time search & online download,
 *  fail overlay, and HUD.
 * =====================================================================
 */

class LazerUI {
  constructor(audioEngine, gameplayEngine, gameRenderer, beatmapLoader) {
    this.audio = audioEngine;
    this.game = gameplayEngine;
    this.renderer = gameRenderer;
    this.loader = beatmapLoader;

    // Screens
    this.screens = {
      menu: document.getElementById("menu-screen"),
      songSelect: document.getElementById("song-select-screen"),
      gameplay: document.getElementById("gameplay-screen"),
      results: document.getElementById("results-screen"),
    };

    // Background Elements
    this.screenBg = document.getElementById("screen-bg-image");
    this.bgCanvas = document.getElementById("bg-canvas");
    this.bgCtx = this.bgCanvas ? this.bgCanvas.getContext("2d") : null;
    this.particles = [];

    // HUD Elements
    this.hudHpFill = document.getElementById("hud-hp-fill");
    this.hudScore = document.getElementById("hud-score");
    this.hudAccuracy = document.getElementById("hud-accuracy");
    this.hudCombo = document.getElementById("hud-combo");
    this.failOverlay = document.getElementById("gameplay-fail-overlay");

    // Mod Badges in HUD
    this.badgeAuto = document.getElementById("hud-badge-auto");
    this.badgeNf = document.getElementById("hud-badge-nf");
    this.badgeHr = document.getElementById("hud-badge-hr");

    // Cached online search results
    this.currentOnlineResults = null;

    this._initParticles();
    this._bindEvents();
    this._startLoop();

    // Re-render song select when async tracks finish loading
    this.loader.onSetLoaded = () => {
      this.refreshSongList();
    };
  }

  switchScreen(screenName) {
    Object.keys(this.screens).forEach(key => {
      if (this.screens[key]) {
        this.screens[key].classList.remove("active");
      }
    });

    if (this.screens[screenName]) {
      this.screens[screenName].classList.add("active");
    }

    if (screenName === "songSelect") {
      this.refreshSongList();
      if (this.loader.activeSet) {
        this.playPreview(this.loader.activeSet);
      }
    } else if (screenName === "gameplay") {
      if (this.failOverlay) this.failOverlay.style.display = "none";
      this._updateHudMods();
      if (this.renderer) {
        this.renderer._resize();
      }
      setTimeout(() => {
        if (this.renderer) this.renderer._resize();
      }, 50);
    }
  }

  _updateHudMods() {
    if (this.badgeAuto) this.badgeAuto.style.display = this.game.isAuto ? "inline-block" : "none";
    if (this.badgeNf) this.badgeNf.style.display = this.game.isNoFail ? "inline-block" : "none";
    if (this.badgeHr) this.badgeHr.style.display = this.game.isHardRock ? "inline-block" : "none";
  }

  // ===================================================================
  //  PARTICLE BACKGROUND (lazer neon triangles)
  // ===================================================================
  _initParticles() {
    if (!this.bgCanvas) return;
    const resizeBg = () => {
      this.bgCanvas.width = window.innerWidth;
      this.bgCanvas.height = window.innerHeight;
    };
    resizeBg();
    window.addEventListener("resize", resizeBg);

    const count = 30;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: 15 + Math.random() * 35,
        speedY: 0.3 + Math.random() * 0.7,
        angle: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        alpha: 0.08 + Math.random() * 0.16,
        color: Math.random() > 0.4 ? "255, 102, 171" : "0, 229, 255",
      });
    }
  }

  _drawParticles() {
    if (!this.bgCtx || !this.bgCanvas) return;
    const ctx = this.bgCtx;
    const w = this.bgCanvas.width;
    const h = this.bgCanvas.height;

    ctx.clearRect(0, 0, w, h);

    for (const p of this.particles) {
      p.y -= p.speedY;
      p.angle += p.rotSpeed;
      if (p.y + p.size < 0) {
        p.y = h + p.size;
        p.x = Math.random() * w;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.beginPath();
      const hTri = p.size * (Math.sqrt(3) / 2);
      ctx.moveTo(0, -hTri * (2 / 3));
      ctx.lineTo(-p.size / 2, hTri * (1 / 3));
      ctx.lineTo(p.size / 2, hTri * (1 / 3));
      ctx.closePath();

      ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${p.color}, ${p.alpha * 1.5})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ===================================================================
  //  SONG SELECT & CAROUSEL
  // ===================================================================
  playPreview(itemOrSet) {
    if (!itemOrSet || !this.audio) return;
    try {
      if (itemOrSet.audioBuffer || itemOrSet.audioBlobUrl) {
        // Local downloaded set
        this.audio.currentTrackBuffer = itemOrSet.audioBuffer || null;
        this.audio.currentAudioBlobUrl = itemOrSet.audioBlobUrl || null;
        const offset = itemOrSet.previewTime > 0 ? itemOrSet.previewTime : 35000;
        this.audio.playTrack(offset);
      } else if (itemOrSet.id) {
        // Online beatmap set preview via official osu! CDN / osu.direct / catboy
        const previewUrl = itemOrSet.preview_url || `https://b.ppy.sh/preview/${itemOrSet.id}.mp3`;
        this.audio.playPreviewUrl(previewUrl);
      }
    } catch (e) {
      console.warn("Could not play preview:", e);
    }
  }

  updateOnlineDetailsPanel(item) {
    if (!item) return;
    const titleEl = document.getElementById("detail-title");
    const artistEl = document.getElementById("detail-artist");
    const creatorEl = document.getElementById("detail-creator");
    const bannerEl = document.getElementById("detail-banner");
    const starEl = document.getElementById("detail-star");
    const csEl = document.getElementById("stat-cs");
    const arEl = document.getElementById("stat-ar");
    const odEl = document.getElementById("stat-od");
    const hpEl = document.getElementById("stat-hp");

    if (titleEl) titleEl.innerText = item.title || "Unknown Title";
    if (artistEl) artistEl.innerText = item.artist || "Unknown Artist";
    if (creatorEl) creatorEl.innerText = `Mapped by ${item.creator || "Unknown"}`;

    const highestSr = (item.beatmaps && item.beatmaps.length > 0)
      ? Math.max(...item.beatmaps.map(b => b.difficulty_rating || 0)).toFixed(1)
      : "4.0";

    const starClass = this.getStarClass(highestSr);
    if (starEl) {
      starEl.innerText = `★ ${highestSr}`;
      starEl.className = `star-rating-pill ${starClass}`;
    }

    const firstDiff = (item.beatmaps && item.beatmaps[0]) || {};
    if (csEl) csEl.innerText = (firstDiff.cs || 4).toFixed(1);
    if (arEl) arEl.innerText = (firstDiff.ar || 5).toFixed(1);
    if (odEl) odEl.innerText = (firstDiff.accuracy || 5).toFixed(1);
    if (hpEl) hpEl.innerText = (firstDiff.drain || 5).toFixed(1);

    const coverUrl = `https://assets.ppy.sh/beatmaps/${item.id}/covers/cover.jpg`;
    if (bannerEl) {
      bannerEl.style.backgroundImage = `url("${coverUrl}")`;
    }
    if (this.screenBg) {
      this.screenBg.style.backgroundImage = `url("${coverUrl}")`;
    }
  }

  getStarRating(diff, isHr = false) {
    const d = diff.difficulty || {};
    let od = d.OverallDifficulty !== undefined ? d.OverallDifficulty : 5;
    let ar = d.ApproachRate !== undefined ? d.ApproachRate : 5;
    let cs = d.CircleSize !== undefined ? d.CircleSize : 4;

    if (isHr) {
      od = Math.min(10, od * 1.4);
      ar = Math.min(10, Math.max(8.5, ar * 1.4));
      cs = Math.min(10, Math.max(5.2, cs * 1.35));
    }

    return (od * 0.4 + ar * 0.35 + cs * 0.25).toFixed(1);
  }

  getStarClass(sr) {
    const s = parseFloat(sr);
    if (s < 2.0) return "diff-easy";
    if (s < 2.7) return "diff-normal";
    if (s < 4.0) return "diff-hard";
    if (s < 5.3) return "diff-insane";
    return "diff-expert";
  }

  async performOnlineSearch(query) {
    if (!query || !query.trim()) return;
    const listPanel = document.getElementById("beatmap-list");
    if (!listPanel) return;

    // Show searching notice
    const notice = document.createElement("div");
    notice.className = "online-section-header";
    notice.innerHTML = `<span>🌐 Searching online for "${query}"...</span><span>⏳</span>`;
    listPanel.appendChild(notice);

    try {
      const results = await this.loader.searchOnline(query);
      notice.remove();
      this.currentOnlineResults = results;
      this.refreshSongList(query, results);
    } catch (e) {
      notice.innerHTML = `<span>⚠️ Search error: ${e.message}</span>`;
    }
  }

  refreshSongList(filterQuery = "", onlineResults = null) {
    const listPanel = document.getElementById("beatmap-list");
    if (!listPanel) return;
    listPanel.innerHTML = "";

    const query = filterQuery.toLowerCase().trim();
    const sets = this.loader.beatmapSets.filter(s => {
      if (!query) return true;
      const matchTitle = s.title.toLowerCase().includes(query);
      const matchArtist = s.artist.toLowerCase().includes(query);
      const matchCreator = s.creator.toLowerCase().includes(query);
      const matchDiff = s.difficulties.some(d => (d.metadata.Version || "").toLowerCase().includes(query));
      return matchTitle || matchArtist || matchCreator || matchDiff;
    });

    const activeOnline = onlineResults || (query ? this.currentOnlineResults : null);

    if (sets.length === 0 && (!activeOnline || activeOnline.length === 0)) {
      listPanel.innerHTML = `
        <div style="padding: 24px; color: var(--text-muted); text-align: center;">
          <p style="font-size: 1rem; color: #ffffff;">No local songs match "${filterQuery}"</p>
          <button class="btn-lazer primary" id="btn-search-online-fallback" style="margin-top: 14px; padding: 8px 20px; font-size: 0.9rem; cursor: pointer;">
            🌐 Search Online for "${filterQuery}"
          </button>
        </div>
      `;
      const fallbackBtn = document.getElementById("btn-search-online-fallback");
      if (fallbackBtn) {
        fallbackBtn.addEventListener("click", () => {
          this.performOnlineSearch(filterQuery);
        });
      }
      return;
    }

    // Render Local Beatmaps
    sets.forEach(set => {
      const card = document.createElement("div");
      card.className = "beatmap-set-card";
      const isSetSelected = this.loader.activeSet === set;
      if (isSetSelected) {
        card.classList.add("active");
      }

      // Card Header
      const header = document.createElement("div");
      header.className = "beatmap-set-header";
      if (set.bgUrl) {
        header.style.backgroundImage = `linear-gradient(90deg, rgba(28, 19, 41, 0.95) 0%, rgba(28, 19, 41, 0.6) 65%), url("${set.bgUrl}")`;
      }
      header.innerHTML = `
        <div class="beatmap-set-info">
          <div class="beatmap-set-title">${set.title}</div>
          <div class="beatmap-set-artist">${set.artist} &bull; mapped by ${set.creator}</div>
        </div>
      `;

      header.addEventListener("click", () => {
        this.loader.activeSet = set;
        if (!set.difficulties.includes(this.loader.activeDifficulty)) {
          this.loader.activeDifficulty = set.difficulties[0];
        }
        this.refreshSongList(filterQuery, activeOnline);
        this.updateDetailsPanel(set, this.loader.activeDifficulty);
        this.playPreview(set);
      });

      card.appendChild(header);

      // Difficulties Container
      const diffContainer = document.createElement("div");
      diffContainer.className = "beatmap-diffs-container";

      set.difficulties.forEach(diff => {
        const badge = document.createElement("div");
        badge.className = "diff-badge";
        const isDiffSelected = isSetSelected && this.loader.activeDifficulty === diff;
        if (isDiffSelected) {
          badge.classList.add("selected");
        }

        const sr = this.getStarRating(diff, this.game.isHardRock);
        const starClass = this.getStarClass(sr);

        badge.innerHTML = `
          <span class="diff-star-icon" style="color: var(--${starClass});">★</span>
          <span>${diff.metadata.Version || "Normal"}</span>
          <span style="font-size: 0.75rem; color: var(--text-secondary);">${sr}</span>
        `;

        badge.addEventListener("click", (e) => {
          e.stopPropagation();
          if (isDiffSelected) {
            this.playCurrentBeatmap();
          } else {
            this.loader.activeSet = set;
            this.loader.activeDifficulty = diff;
            this.refreshSongList(filterQuery, activeOnline);
            this.updateDetailsPanel(set, diff);
            this.playPreview(set);
          }
        });

        diffContainer.appendChild(badge);
      });

      card.appendChild(diffContainer);
      listPanel.appendChild(card);
    });

    // Render Online Search Results
    if (activeOnline && activeOnline.length > 0) {
      const onlineHeader = document.createElement("div");
      onlineHeader.className = "online-section-header";
      onlineHeader.innerHTML = `<span>🌐 Online Results (${activeOnline.length})</span><span>Catboy / Mino</span>`;
      listPanel.appendChild(onlineHeader);

      activeOnline.forEach(item => {
        const oCard = document.createElement("div");
        oCard.className = "online-card";
        oCard.style.backgroundImage = `linear-gradient(90deg, rgba(20, 14, 30, 0.95) 0%, rgba(20, 14, 30, 0.72) 75%), url("https://assets.ppy.sh/beatmaps/${item.id}/covers/card.jpg")`;
        oCard.style.backgroundSize = "cover";
        oCard.style.backgroundPosition = "center";

        const existingSet = this.loader.beatmapSets.find(s =>
          (item.id && s.id == item.id) ||
          (s.title && s.title.toLowerCase() === (item.title || "").toLowerCase())
        );

        const highestSr = (item.beatmaps && item.beatmaps.length > 0)
          ? Math.max(...item.beatmaps.map(b => b.difficulty_rating || 0)).toFixed(1)
          : "?";

        oCard.innerHTML = `
          <div class="online-card-info">
            <div class="online-card-title">${item.title}</div>
            <div class="online-card-artist">${item.artist} &bull; ${item.creator} <span class="diff-star-icon" style="color: var(--accent-gold); margin-left: 6px;">★ ${highestSr}</span></div>
          </div>
          <button class="btn-download-osz ${existingSet ? "installed" : ""}" id="btn-dl-${item.id}">
            ${existingSet ? "▶ PLAY" : "⬇ Download"}
          </button>
        `;

        const dlBtn = oCard.querySelector(`#btn-dl-${item.id}`);

        // 1. Tapping the card selects it, updates Wedge details, and plays music preview
        oCard.addEventListener("click", (e) => {
          if (e.target === dlBtn || dlBtn.contains(e.target)) return;
          // Highlight this card as selected
          document.querySelectorAll(".online-card").forEach(c => c.classList.remove("active"));
          oCard.classList.add("active");

          if (existingSet) {
            this.loader.activeSet = existingSet;
            this.loader.activeDifficulty = existingSet.difficulties[0];
            this.updateDetailsPanel(existingSet, existingSet.difficulties[0]);
            this.playPreview(existingSet);
          } else {
            this.updateOnlineDetailsPanel(item);
            this.playPreview(item);
          }
        });

        // 2. Tapping the download button downloads the track
        dlBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          e.preventDefault();

          if (existingSet) {
            this.loader.activeSet = existingSet;
            this.loader.activeDifficulty = existingSet.difficulties[0];
            this.updateDetailsPanel(existingSet, existingSet.difficulties[0]);
            this.playCurrentBeatmap();
            return;
          }

          dlBtn.className = "btn-download-osz downloading";
          dlBtn.innerText = "⏳ Downloading...";

          try {
            const newSet = await this.loader.downloadOnlineSet(item.id);
            if (newSet) {
              dlBtn.className = "btn-download-osz installed";
              dlBtn.innerText = "▶ PLAY NOW";
              this.refreshSongList(filterQuery, activeOnline);
              this.updateDetailsPanel(newSet, newSet.difficulties[0]);
              this.playPreview(newSet);
            }
          } catch (err) {
            dlBtn.className = "btn-download-osz";
            dlBtn.innerText = "❌ Retry";
            alert("Download failed: " + err.message);
          }
        });

        listPanel.appendChild(oCard);
      });
    }

    // Auto-update details panel if not set
    if (this.loader.activeSet && this.loader.activeDifficulty) {
      this.updateDetailsPanel(this.loader.activeSet, this.loader.activeDifficulty);
    } else if (sets.length > 0) {
      this.loader.activeSet = sets[0];
      this.loader.activeDifficulty = sets[0].difficulties[0];
      this.updateDetailsPanel(sets[0], sets[0].difficulties[0]);
    }
  }

  updateDetailsPanel(set, diff) {
    if (!set || !diff) return;

    const meta = diff.metadata;
    const d = diff.difficulty;

    const titleEl = document.getElementById("detail-title");
    const artistEl = document.getElementById("detail-artist");
    const creatorEl = document.getElementById("detail-creator");
    const csEl = document.getElementById("stat-cs");
    const arEl = document.getElementById("stat-ar");
    const odEl = document.getElementById("stat-od");
    const hpEl = document.getElementById("stat-hp");
    const bannerEl = document.getElementById("detail-banner");
    const starEl = document.getElementById("detail-star");

    if (titleEl) titleEl.innerText = meta.Title;
    if (artistEl) artistEl.innerText = meta.Artist;
    if (creatorEl) creatorEl.innerText = `Mapped by ${meta.Creator}`;

    // HardRock mod stat multipliers
    const isHr = this.game.isHardRock;
    const cs = isHr ? Math.min(10, Math.max(5.2, (d.CircleSize || 4) * 1.35)) : (d.CircleSize || 4);
    const ar = isHr ? Math.min(10, Math.max(8.5, (d.ApproachRate || 5) * 1.4)) : (d.ApproachRate || 5);
    const od = isHr ? Math.min(10, (d.OverallDifficulty || 5) * 1.4) : (d.OverallDifficulty || 5);
    const hp = isHr ? Math.min(10, (d.HPDrainRate || 5) * 1.4) : (d.HPDrainRate || 5);

    if (csEl) {
      csEl.innerText = cs.toFixed(1);
      csEl.style.color = isHr ? "var(--accent-red)" : "var(--accent-cyan)";
    }
    if (arEl) {
      arEl.innerText = ar.toFixed(1);
      arEl.style.color = isHr ? "var(--accent-red)" : "var(--accent-cyan)";
    }
    if (odEl) {
      odEl.innerText = od.toFixed(1);
      odEl.style.color = isHr ? "var(--accent-red)" : "var(--accent-cyan)";
    }
    if (hpEl) {
      hpEl.innerText = hp.toFixed(1);
      hpEl.style.color = isHr ? "var(--accent-red)" : "var(--accent-cyan)";
    }

    const sr = this.getStarRating(diff, isHr);
    const starClass = this.getStarClass(sr);

    if (starEl) {
      starEl.innerText = `★ ${sr}${isHr ? " (HR)" : ""}`;
      starEl.className = `star-rating-pill ${isHr ? "diff-insane" : starClass}`;
    }

    if (bannerEl) {
      if (set.bgUrl) {
        bannerEl.style.backgroundImage = `url("${set.bgUrl}")`;
      } else {
        bannerEl.style.backgroundImage = `linear-gradient(135deg, #382656, #1f1430)`;
      }
    }

    // Update full screen background image
    if (this.screenBg) {
      if (set.bgUrl) {
        this.screenBg.style.backgroundImage = `url("${set.bgUrl}")`;
      } else {
        this.screenBg.style.backgroundImage = `none`;
      }
    }
  }

  playCurrentBeatmap() {
    const diff = this.loader.activeDifficulty;
    const set = this.loader.activeSet;
    if (!diff) return;

    if (window.pauseKosuAudio) {
      window.pauseKosuAudio();
    }

    this.audio.resume();

    // Attach audio buffer and fallback HTML5 audio blob URL
    this.audio.currentTrackBuffer = (set && set.audioBuffer) ? set.audioBuffer : null;
    this.audio.currentAudioBlobUrl = (set && set.audioBlobUrl) ? set.audioBlobUrl : null;

    this.game.loadBeatmap(diff);
    this.switchScreen("gameplay");
    if (this.renderer) this.renderer._resize();
    this.game.start();
  }

  // ===================================================================
  //  EVENT BINDINGS
  // ===================================================================
  _bindEvents() {
    // 1. LET'S GO! button in Song Select
    const btnLetsGo = document.getElementById("btn-lets-go");
    if (btnLetsGo) {
      const handleLetsGo = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.playCurrentBeatmap();
      };
      btnLetsGo.addEventListener("click", handleLetsGo);
      btnLetsGo.addEventListener("pointerdown", handleLetsGo);
      btnLetsGo.addEventListener("touchend", handleLetsGo);
    }

    // 2. Mod Toggles (Auto, NoFail, HardRock)
    const btnModAuto = document.getElementById("btn-mod-auto");
    if (btnModAuto) {
      btnModAuto.addEventListener("click", () => {
        this.game.isAuto = !this.game.isAuto;
        btnModAuto.classList.toggle("active", this.game.isAuto);
        this._updateHudMods();
      });
    }

    const btnModNf = document.getElementById("btn-mod-nf");
    if (btnModNf) {
      btnModNf.addEventListener("click", () => {
        this.game.isNoFail = !this.game.isNoFail;
        btnModNf.classList.toggle("active", this.game.isNoFail);
        this._updateHudMods();
      });
    }

    const btnModHr = document.getElementById("btn-mod-hr");
    if (btnModHr) {
      btnModHr.addEventListener("click", () => {
        this.game.isHardRock = !this.game.isHardRock;
        btnModHr.classList.toggle("active", this.game.isHardRock);
        this._updateHudMods();
        if (this.loader.activeSet && this.loader.activeDifficulty) {
          this.updateDetailsPanel(this.loader.activeSet, this.loader.activeDifficulty);
        }
        const searchInput = document.getElementById("search-input");
        this.refreshSongList(searchInput ? searchInput.value : "");
      });
    }

    // 3. Search Filter, Clear button & Online Search
    const searchInput = document.getElementById("search-input");
    const searchClearBtn = document.getElementById("search-clear-btn");
    const btnSearchOnline = document.getElementById("btn-search-online");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const val = e.target.value;
        if (searchClearBtn) {
          searchClearBtn.style.display = val ? "block" : "none";
        }
        this.refreshSongList(val);
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.performOnlineSearch(searchInput.value);
        }
      });
    }

    if (searchClearBtn && searchInput) {
      searchClearBtn.addEventListener("click", () => {
        searchInput.value = "";
        searchClearBtn.style.display = "none";
        this.currentOnlineResults = null;
        this.refreshSongList("");
        searchInput.focus();
      });
    }

    if (btnSearchOnline && searchInput) {
      btnSearchOnline.addEventListener("click", () => {
        this.performOnlineSearch(searchInput.value);
      });
    }

    // 4. Gameplay In-Game Events (Multi-touch with pointerId)
    const canvas = document.getElementById("gameplay-canvas");
    if (canvas) {
      canvas.addEventListener("pointerdown", (e) => {
        const rect = canvas.getBoundingClientRect();
        this.game.handlePointerDown(e.pointerId, e.clientX - rect.left, e.clientY - rect.top);
      });

      canvas.addEventListener("pointermove", (e) => {
        const rect = canvas.getBoundingClientRect();
        this.game.handlePointerMove(e.pointerId, e.clientX - rect.left, e.clientY - rect.top);
      });

      canvas.addEventListener("pointerup", (e) => {
        this.game.handlePointerUp(e.pointerId);
      });

      canvas.addEventListener("pointercancel", (e) => {
        this.game.handlePointerUp(e.pointerId);
      });

      // Keyboard bindings (Z, X keys)
      window.addEventListener("keydown", (e) => {
        if (e.code === "KeyZ" || e.code === "KeyX") {
          this.game.handlePointerDown("key",
            this.game.pointer.x * this.game.playfield.scale + this.game.playfield.x,
            this.game.pointer.y * this.game.playfield.scale + this.game.playfield.y
          );
        } else if (e.code === "Escape") {
          if (this.game.isRunning) {
            this.game.stop();
            this.switchScreen("songSelect");
          }
        }
      });

      window.addEventListener("keyup", (e) => {
        if (e.code === "KeyZ" || e.code === "KeyX") {
          this.game.handlePointerUp("key");
        }
      });
    }

    // 5. HUD Pause & Exit buttons (with touch & pointer support)
    const pauseBtn = document.getElementById("hud-pause-btn");
    if (pauseBtn) {
      const togglePause = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.game.pause();
        pauseBtn.innerText = this.game.isPaused ? "Resume" : "Pause";
      };
      pauseBtn.addEventListener("pointerdown", togglePause);
      pauseBtn.addEventListener("touchend", togglePause);
      pauseBtn.addEventListener("click", togglePause);
    }

    const exitBtn = document.getElementById("hud-exit-btn");
    if (exitBtn) {
      const triggerExit = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.game.stop();
        this.switchScreen("songSelect");
      };
      exitBtn.addEventListener("pointerdown", triggerExit);
      exitBtn.addEventListener("touchend", triggerExit);
      exitBtn.addEventListener("click", triggerExit);
    }

    // 6. Fail Screen Buttons (Retry & Quit)
    const btnFailRetry = document.getElementById("btn-fail-retry");
    if (btnFailRetry) {
      btnFailRetry.addEventListener("click", () => {
        if (this.failOverlay) this.failOverlay.style.display = "none";
        this.playCurrentBeatmap();
      });
    }

    const btnFailQuit = document.getElementById("btn-fail-quit");
    if (btnFailQuit) {
      btnFailQuit.addEventListener("click", () => {
        if (this.failOverlay) this.failOverlay.style.display = "none";
        this.switchScreen("songSelect");
      });
    }

    // 7. Gameplay Callbacks
    this.game.onGameFail = () => {
      if (this.failOverlay) this.failOverlay.style.display = "flex";
    };

    this.game.onStatsUpdate = (stats) => {
      if (this.hudHpFill) this.hudHpFill.style.width = `${Math.max(0, Math.min(100, stats.hp * 100))}%`;
      if (this.hudScore) this.hudScore.innerText = stats.score.toString().padStart(8, "0");
      if (this.hudAccuracy) this.hudAccuracy.innerText = `${stats.accuracy.toFixed(2)}%`;
      if (this.hudCombo) this.hudCombo.innerText = stats.combo.toString();
    };

    this.game.onGameEnd = (results) => {
      this._showResults(results);
    };

    // 8. Results buttons
    const btnResultsRetry = document.getElementById("btn-results-retry");
    if (btnResultsRetry) {
      btnResultsRetry.addEventListener("click", () => {
        this.playCurrentBeatmap();
      });
    }

    const btnResultsBack = document.getElementById("btn-results-back");
    if (btnResultsBack) {
      btnResultsBack.addEventListener("click", () => {
        this.switchScreen("songSelect");
      });
    }
  }

  _showResults(r) {
    this.switchScreen("results");

    const badge = document.getElementById("res-grade");
    if (badge) {
      badge.innerText = r.grade;
      badge.className = `results-grade-badge grade-${r.grade.toLowerCase()}`;
    }

    const titleEl = document.getElementById("res-title");
    if (titleEl) titleEl.innerText = `${r.artist} - ${r.title} [${r.version}]`;

    const scoreEl = document.getElementById("res-score");
    if (scoreEl) scoreEl.innerText = r.score.toLocaleString();

    const accEl = document.getElementById("res-acc");
    if (accEl) accEl.innerText = `${r.accuracy}%`;

    const comboEl = document.getElementById("res-combo");
    if (comboEl) comboEl.innerText = `${r.maxCombo}x`;

    const c300 = document.getElementById("res-300");
    if (c300) c300.innerText = r.count300;

    const c100 = document.getElementById("res-100");
    if (c100) c100.innerText = r.count100;

    const c50 = document.getElementById("res-50");
    if (c50) c50.innerText = r.count50;

    const cMiss = document.getElementById("res-miss");
    if (cMiss) cMiss.innerText = r.countMiss;
  }

  // ===================================================================
  //  MAIN RENDER & UPDATE LOOP
  // ===================================================================
  _startLoop() {
    let lastTime = performance.now();

    const loop = (now) => {
      const delta = now - lastTime;
      lastTime = now;

      this._drawParticles();

      if (this.game.isRunning) {
        this.game.update(delta);
        this.renderer.render();
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = LazerUI;
}
