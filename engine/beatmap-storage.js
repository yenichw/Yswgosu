/**
 * =====================================================================
 *  Beatmap Persistent Storage (IndexedDB)
 *  Saves downloaded .osz archives so they persist across app restarts.
 * =====================================================================
 */

class BeatmapStorage {
  static openDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        return resolve(null);
      }
      const req = indexedDB.open("KosuBeatmapsDB", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("beatmaps")) {
          db.createObjectStore("beatmaps", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("IndexedDB open error:", req.error);
        resolve(null);
      };
    });
  }

  static async saveBeatmap(id, title, arrayBuffer) {
    try {
      const db = await this.openDB();
      if (!db) return;
      const tx = db.transaction("beatmaps", "readwrite");
      const store = tx.objectStore("beatmaps");
      store.put({
        id: String(id),
        title: title || "Unknown",
        data: arrayBuffer,
        timestamp: Date.now()
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      console.log(`Saved beatmap set [${id}] "${title}" to persistent storage`);
    } catch (e) {
      console.warn("Failed to save beatmap to IndexedDB:", e);
    }
  }

  static async loadAllBeatmaps() {
    try {
      const db = await this.openDB();
      if (!db) return [];
      const tx = db.transaction("beatmaps", "readonly");
      const store = tx.objectStore("beatmaps");
      const req = store.getAll();
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      console.warn("Failed to load beatmaps from IndexedDB:", e);
      return [];
    }
  }

  static async deleteBeatmap(id) {
    try {
      const db = await this.openDB();
      if (!db) return;
      const tx = db.transaction("beatmaps", "readwrite");
      tx.objectStore("beatmaps").delete(String(id));
    } catch (e) {}
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = BeatmapStorage;
}
