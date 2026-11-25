<div align="center">

<img src="assets/osu-assets/osu.Game.Resources/Textures/Menu/logo.png" width="180" alt="Yswgosu Logo"/>

# 🎮 Yswgosu (osu! Web & Android Plugin)

> **A high-performance, cross-platform osu! rhythm client built for modern Web Browsers and exteraGram / Elyx Telegram plugins on Android.**

[![Play Online](https://img.shields.io/badge/🎮_Play_Online-GitHub_Pages-ff66aa?style=for-the-badge&logo=googlechrome&logoColor=white)](https://yenichw.github.io/Yswgosu/)
[![Platform](https://img.shields.io/badge/Platform-Web_%7C_Android_(Elyx)-00e5ff?style=for-the-badge&logo=android&logoColor=white)](#-controls)
[![Plugin Size](https://img.shields.io/badge/Plugin_Size-~325_KB-00e676?style=for-the-badge&logo=telegram&logoColor=white)](#-android-plugin-installation-exteragram--elyx)
[![License](https://img.shields.io/badge/License-MIT_%2F_GPL-ffd600?style=for-the-badge)](#-credits--acknowledgments)

<p align="center">
  <a href="https://yenichw.github.io/Yswgosu/"><b>🌐 Launch Web Version</b></a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-controls">Controls</a> •
  <a href="#-android-plugin-installation-exteragram--elyx">Android Plugin</a> •
  <a href="#-credits--acknowledgments">Credits</a>
</p>

---

</div>

## 🌟 Key Features

<table>
  <tr>
    <td width="50%">
      <h3>⚡ Instant Beatmap Streaming & Downloads</h3>
      <ul>
        <li>Direct in-game search and instant <code>.osz</code> archive streaming downloads with live progress indicators.</li>
        <li>Multi-mirror fallback chain: <b>osu.direct</b> ➔ <b>Nerinyan</b> ➔ <b>Sayobot</b> with strict timeouts to prevent hanging.</li>
        <li>Instant audio preview playback right from the Song Select wedge.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🎼 Universal Parser & Auto-Converter</h3>
      <ul>
        <li>Parses standard <code>.osu</code> v14+ formats directly in-memory using <b>JSZip</b>.</li>
        <li><b>Universal Compatibility:</b> Automatically converts non-standard beatmapsets (Taiko, Mania, Catch) into playable standard circles and sliders on the 512×384 playfield.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>💾 Offline Persistent Library</h3>
      <ul>
        <li>All downloaded beatmaps are automatically saved to local <b>IndexedDB</b> storage.</li>
        <li>Installed songs remain available forever across sessions and restarts without re-downloading.</li>
        <li>Bundled with official preloaded tracks for instant gameplay.</li>
      </ul>
    </td>
  </tr>
</table>

---

## 🕹 Controls

### 💻 Desktop Browser (PC / Mac / Linux)

| Action | Input | Description |
|---|---|---|
| **Aim** | 🖱️ Mouse Movement | Direct cursor aiming with 16-point motion trail |
| **Hit Notes** | <kbd>Z</kbd> / <kbd>X</kbd> or <kbd>Left Click</kbd> / <kbd>Right Click</kbd> | Hardware-accurate key register (key-repeat safe) |
| **Follow Sliders** | Hold <kbd>Z</kbd> / <kbd>X</kbd> / <kbd>Mouse</kbd> inside follow circle | Tracks slider progress and ticks |
| **Spinners** | Rotate cursor around center | High-speed rotation detection |
| **Pause / Back** | <kbd>Escape</kbd> or In-Game HUD button | Pauses gameplay or returns to Song Select / Main Menu |
| **Quick Start** | <kbd>Enter</kbd> / <kbd>Space</kbd> | Starts selected beatmap instantly |

### 📱 Android Smartphone (exteraGram / Elyx Plugin)

| Action | Gesture / Input | Description |
|---|---|---|
| **Hit Notes & Sliders** | 👆 Tap & Hold Screen (Multi-touch) | Responsive multi-finger tapping with adaptive touch slop |
| **System Back** | 🔙 Android Back Gesture / Button | Returns to menu or triggers safe exit |
| **Launch Plugin** | `.osu` or `.ysw` in any chat | Or tap the direct button in plugin settings |

---

## 📦 Android Plugin Installation (exteraGram / Elyx)

```
1. Download Yswgosu.elyx (or Yswgosu.eaf) from the repository releases / root folder.
2. Send the file to your "Saved Messages" in Telegram.
3. Tap on the file attachment and choose "Install Plugin".
4. Open the game by tapping the plugin action or sending .ysw or .osu in any chat!
```

---

## 🏗️ Architecture & Engine Overview

```
                      ┌─────────────────────────────────────────┐
                      │             index.html / HUD            │
                      └────────────────────┬────────────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         │                                 │                                 │
         ▼                                 ▼                                 ▼
┌──────────────────┐             ┌──────────────────┐             ┌──────────────────┐
│   Audio Engine   │             │ Gameplay Engine  │             │  Game Renderer   │
│ Web Audio + Clock│◄───────────►│ Judgements & HP  │◄───────────►│  Canvas 2D / DPR │
└──────────────────┘             └─────────┬────────┘             └──────────────────┘
                                           │
                                           ▼
                                 ┌──────────────────┐
                                 │  Beatmap Loader  │
                                 │ IndexedDB / OSZ  │
                                 └─────────┬────────┘
                                           │
                 ┌─────────────────────────┴─────────────────────────┐
                 ▼                                                   ▼
      ┌─────────────────────┐                             ┌─────────────────────┐
      │   osu.direct / CDN  │                             │ Sayobot / Nerinyan  │
      └─────────────────────┘                             └─────────────────────┘
```

---

## 🙏 Credits & Acknowledgments

The **Yswgosu** project is built upon the incredible open-source heritage of the rhythm gaming and web development communities. Sincere gratitude to all authors and teams whose technologies and assets made this possible:

1. **[ppy (Dean Herbert)](https://github.com/ppy) & the [osu!](https://osu.ppy.sh) Team**  
   Creators of the original osu! and osu!lazer games. For the revolutionary gameplay design, beatmap formats (`.osu`, `.osz`), sound design, visual identity, and endless inspiration.  
   *Repository:* [https://github.com/ppy/osu](https://github.com/ppy/osu)

2. **[kosu!](https://github.com/) WebGL Project**  
   Foundational web architecture and asset pipeline inspiration.

3. **[PixiJS](https://pixijs.com)**  
   Industry-standard 2D WebGL rendering engine powering smooth 60+ FPS web performance.

4. **[JSZip](https://stuk.github.io/jszip/)**  
   Blazing-fast in-memory `.osz` zip archive extraction without temporary disk overhead.

5. **Public Beatmap Mirrors:**
   - **[osu.direct](https://osu.direct)** — High-speed public beatmap API and clean CORS endpoints.
   - **[Nerinyan](https://api.nerinyan.moe)** — Cloudflare-accelerated beatmap mirror.
   - **[Sayobot](https://sayobot.cn)** — Established beatmap delivery network.
   - **[Catboy / Mino](https://catboy.best)** — Alternative beatmap database and metadata provider.

6. **[exteraGram](https://github.com/exteraClan/exteraGram) & Elyx Platform**  
   The powerful plugin platform and execution environment for modern Android Telegram clients.

---

## 👤 Author & Support

- **Lead Developer & Adaptation:** [yenichw](https://github.com/yenichw) (feat. dolphin distilled)
- **Repository:** [https://github.com/yenichw/Yswgosu](https://github.com/yenichw/Yswgosu)
- **Play Online:** [https://yenichw.github.io/Yswgosu/](https://yenichw.github.io/Yswgosu/)
- **License:** MIT / GNU GPL (aligned with upstream osu! dependencies)
