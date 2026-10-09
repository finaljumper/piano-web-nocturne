/**
 * Keyboard and touch input, mapped onto an arbitrary number of lanes.
 *
 * The layouts are centred on the gap between the hands so that, at every lane
 * count, the left half of the highway is played with the left hand.
 */

export const KEY_LAYOUTS = {
  4: ["D", "F", "J", "K"],
  6: ["S", "D", "F", "J", "K", "L"],
};

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8"];

export class Input {
  /**
   * @param {object} o
   * @param {(lane:number, songTime:number)=>void} o.onPress
   * @param {(lane:number)=>void} o.onRelease
   * @param {()=>void} o.onPause
   * @param {()=>void} [o.onAnyInput]
   */
  constructor(o) {
    this.onPress = o.onPress;
    this.onRelease = o.onRelease;
    this.onPause = o.onPause;
    this.onAnyInput = o.onAnyInput;

    this.laneCount = 0;
    this.labels = [];
    this._lookup = new Map();
    this._down = new Set();
    this._touch = new Map(); // pointerId -> lane
    this.enabled = true;
    this.touchEl = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
  }

  setLanes(n, palette) {
    this.laneCount = n;
    this.palette = palette ?? null;
    this.labels = KEY_LAYOUTS[n] ?? KEY_LAYOUTS[6];
    this._lookup.clear();
    this.labels.forEach((label, lane) => {
      this._lookup.set(label.toUpperCase(), lane);
      this._lookup.set(label.toLowerCase(), lane);
    });
    // Number-row alternates.
    this.labels.forEach((_, lane) => this._lookup.set(DIGITS[lane], lane));
    this._down.clear();
    this._renderTouch();
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this._releaseAll();
  }

  attach() {
    window.addEventListener("keydown", this._onKeyDown, { passive: false });
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
  }

  detach() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
  }

  _onKeyDown(e) {
    if (e.repeat) return;
    const key = e.key;
    if (key === "Escape" || key === "p" || key === "P") {
      e.preventDefault();
      this.onPause?.();
      return;
    }
    if (!this.enabled) return;
    const lane = this._lookup.get(key) ?? this._lookup.get(key.toUpperCase());
    if (lane === undefined) return;
    e.preventDefault();
    this.onAnyInput?.();
    if (this._down.has(lane)) return;
    this._down.add(lane);
    this._markLabel(lane, true);
    this.onPress?.(lane);
  }

  _onKeyUp(e) {
    const lane = this._lookup.get(e.key) ?? this._lookup.get(e.key.toUpperCase());
    if (lane === undefined) return;
    this._down.delete(lane);
    this._markLabel(lane, false);
    this.onRelease?.(lane);
  }

  _onBlur() {
    this._releaseAll();
  }

  _releaseAll() {
    for (const lane of this._down) {
      this._markLabel(lane, false);
      this.onRelease?.(lane);
    }
    this._down.clear();
    for (const [pointerId, lane] of this._touch) {
      this._markTouch(pointerId, lane, false);
      this.onRelease?.(lane);
    }
    this._touch.clear();
  }

  /* ---------------------------------------------------------------------- */
  /* touch                                                                  */
  /* ---------------------------------------------------------------------- */

  /** @param {HTMLElement} container */
  mountTouch(container) {
    this.touchEl = container;
    this._renderTouch();
  }

  _renderTouch() {
    const el = this.touchEl;
    if (!el) return;
    el.innerHTML = "";
    for (let lane = 0; lane < this.laneCount; lane++) {
      const btn = document.createElement("button");
      btn.className = "touch-key";
      btn.dataset.lane = String(lane);
      btn.textContent = this.labels[lane] ?? "";
      btn.style.setProperty("--accent", this.palette?.[lane] ?? "#e9c46a");
      btn.setAttribute("aria-label", `Lane ${lane + 1}`);
      el.appendChild(btn);
    }
  }

  _markLabel(lane, on) {
    const labels = document.querySelectorAll(`#laneLabels .lane-label`);
    const el = labels[lane];
    if (el) el.classList.toggle("is-hit", on);
    const touch = this.touchEl?.children[lane];
    if (touch) touch.classList.toggle("is-down", on);
  }

  _markTouch(_pointerId, lane, on) {
    const el = this.touchEl?.children[lane];
    if (el) el.classList.toggle("is-down", on);
    const labels = document.querySelectorAll(`#laneLabels .lane-label`);
    const lab = labels[lane];
    if (lab) lab.classList.toggle("is-hit", on);
  }

  /** Called from the app's pointer handlers. */
  pointerDown(pointerId, lane) {
    if (!this.enabled) return;
    this.onAnyInput?.();
    if (this._touch.has(pointerId)) return;
    this._touch.set(pointerId, lane);
    this._markTouch(pointerId, lane, true);
    this.onPress?.(lane);
  }

  pointerUp(pointerId) {
    const lane = this._touch.get(pointerId);
    if (lane === undefined) return;
    this._touch.delete(pointerId);
    this._markTouch(pointerId, lane, false);
    this.onRelease?.(lane);
  }
}
