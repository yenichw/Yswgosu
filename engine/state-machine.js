/**
 * =====================================================================
 *  Yswgosu Deterministic Game State Machine (FSM)
 *  Enforces STRICT state transitions, preventing race conditions,
 *  arbitrary execution, overlapping audio, or illegal screen states.
 * =====================================================================
 */

const GameStates = Object.freeze({
  BOOT: "BOOT",
  KOSU_INTRO: "KOSU_INTRO",
  KOSU_MENU: "KOSU_MENU",
  SONG_SELECT: "SONG_SELECT",
  BEATMAP_PREPARING: "BEATMAP_PREPARING",
  GAMEPLAY_COUNTDOWN: "GAMEPLAY_COUNTDOWN",
  GAMEPLAY: "GAMEPLAY",
  PAUSED: "PAUSED",
  FAILED: "FAILED",
  RESULTS: "RESULTS",
});

class GameStateMachine {
  constructor() {
    this.currentState = GameStates.BOOT;
    this.previousState = null;
    this.stateData = null;
    this.listeners = new Map();

    // Allowed transition map (Directional Graph)
    this.allowedTransitions = {
      [GameStates.BOOT]: [
        GameStates.KOSU_INTRO,
        GameStates.KOSU_MENU,
        GameStates.SONG_SELECT,
      ],
      [GameStates.KOSU_INTRO]: [
        GameStates.KOSU_MENU,
        GameStates.SONG_SELECT,
      ],
      [GameStates.KOSU_MENU]: [
        GameStates.SONG_SELECT,
        GameStates.KOSU_INTRO,
      ],
      [GameStates.SONG_SELECT]: [
        GameStates.KOSU_MENU,
        GameStates.BEATMAP_PREPARING,
        GameStates.GAMEPLAY_COUNTDOWN,
        GameStates.GAMEPLAY,
      ],
      [GameStates.BEATMAP_PREPARING]: [
        GameStates.GAMEPLAY_COUNTDOWN,
        GameStates.GAMEPLAY,
        GameStates.SONG_SELECT,
      ],
      [GameStates.GAMEPLAY_COUNTDOWN]: [
        GameStates.GAMEPLAY,
        GameStates.SONG_SELECT,
      ],
      [GameStates.GAMEPLAY]: [
        GameStates.PAUSED,
        GameStates.FAILED,
        GameStates.RESULTS,
        GameStates.SONG_SELECT,
      ],
      [GameStates.PAUSED]: [
        GameStates.GAMEPLAY,
        GameStates.GAMEPLAY_COUNTDOWN,
        GameStates.SONG_SELECT,
      ],
      [GameStates.FAILED]: [
        GameStates.GAMEPLAY_COUNTDOWN,
        GameStates.GAMEPLAY,
        GameStates.SONG_SELECT,
      ],
      [GameStates.RESULTS]: [
        GameStates.GAMEPLAY_COUNTDOWN,
        GameStates.GAMEPLAY,
        GameStates.SONG_SELECT,
      ],
    };

    if (window.EngineLog) {
      window.EngineLog.info("FSM", "State Machine initialized at state BOOT");
    }
  }

  canTransitionTo(targetState) {
    const validTargets = this.allowedTransitions[this.currentState] || [];
    return validTargets.includes(targetState);
  }

  transitionTo(targetState, data = null) {
    if (this.currentState === targetState) {
      if (window.EngineLog) window.EngineLog.warn("FSM", `Already in state ${targetState}, ignoring transition`);
      return false;
    }

    if (!this.canTransitionTo(targetState)) {
      const err = new Error(`Illegal state transition from ${this.currentState} to ${targetState}`);
      if (window.EngineLog) {
        window.EngineLog.error("FSM", err.message, { current: this.currentState, target: targetState });
      }
      return false;
    }

    const fromState = this.currentState;
    this.previousState = fromState;
    this.currentState = targetState;
    this.stateData = data;

    if (window.EngineLog) {
      window.EngineLog.info("FSM", `State: ${fromState} ──► ${targetState}`, data ? { data } : null);
    }

    // Trigger state transition subscribers
    const callbacks = this.listeners.get(targetState) || [];
    callbacks.forEach(cb => {
      try {
        cb(data, fromState);
      } catch (err) {
        if (window.EngineLog) {
          window.EngineLog.crash(err, `Error in FSM listener for ${targetState}`);
        }
      }
    });

    const anyCallbacks = this.listeners.get("*") || [];
    anyCallbacks.forEach(cb => {
      try {
        cb(targetState, fromState, data);
      } catch (err) {
        if (window.EngineLog) {
          window.EngineLog.crash(err, `Error in wildcard FSM listener`);
        }
      }
    });

    return true;
  }

  on(state, callback) {
    if (!this.listeners.has(state)) {
      this.listeners.set(state, []);
    }
    this.listeners.get(state).push(callback);
  }

  getState() {
    return this.currentState;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { GameStates, GameStateMachine };
} else {
  window.GameStates = GameStates;
  window.GameStateMachine = GameStateMachine;
  window.FSM = new GameStateMachine();
}
