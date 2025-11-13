/**
 * UI Manager - handles DOM manipulation and metrics panel rendering
 * @module core/ui-manager
 */

import { createGraphics } from "../graphics.js";
import { formatMm, formatDeg, formatCm, safeColor } from "../utils/formatters.js";
import { COLOR_CONFIG, IPD_OVERLAY_CONFIG, UI_CONFIG } from "../config.js";

/**
 * Manages UI elements, DOM references, and metrics panel rendering
 */
export class UIManager {
  constructor() {
    // Video and canvas elements
    this.video = document.getElementById("webcam");
    this.canvasElement = document.getElementById("output_canvas");
    this.canvasCtx = this.canvasElement.getContext("2d");

    // Control elements
    this.noseOverlayToggleEl = document.getElementById("nose_overlay_toggle");
    this.mirrorToggleEl = document.getElementById("mirror_toggle");
    this.mirrorPanelEl = document.getElementById("mirror_panel");

    // Metrics panel elements
    this.metricsPanelEl = document.getElementById("metrics_panel");
    this.metricsPanelBodyEl = document.getElementById("metrics_panel_body");

    // Graphics renderer
    this.graphics = createGraphics(this.canvasElement, this.canvasCtx);

    // Event callbacks
    this.callbacks = {};
  }

  /**
   * Get current video dimensions
   * @returns {{width: number, height: number}}
   */
  getVideoDimensions() {
    return {
      width: this.video?.videoWidth || 1280,
      height: this.video?.videoHeight || 720,
    };
  }

  /**
   * Synchronize canvas resolution with video
   */
  syncCanvasResolution() {
    const { width, height } = this.getVideoDimensions();
    if (this.canvasElement.width !== width) this.canvasElement.width = width;
    if (this.canvasElement.height !== height) this.canvasElement.height = height;
  }

  /**
   * Resize display to fit container while maintaining aspect ratio
   */
  resizeDisplayToContainer() {
    const container =
      document.querySelector(".videoView") ||
      document.getElementById("liveView") ||
      document.body;

    const rect = container.getBoundingClientRect();
    const targetW = Math.max(1, Math.floor(rect.width));
    const targetH = Math.max(1, Math.floor(rect.height));

    const { width: vidW, height: vidH } = this.getVideoDimensions();
    const scale = Math.min(targetW / vidW, targetH / vidH);

    const w = Math.round(vidW * scale);
    const h = Math.round(vidH * scale);

    this.video.style.width = `${w}px`;
    this.video.style.height = `${h}px`;
    this.canvasElement.style.width = `${w}px`;
    this.canvasElement.style.height = `${h}px`;

    // Keep the backing buffer sharp on HiDPI
    const dpr = window.devicePixelRatio || 1;
    this.canvasElement.width = Math.round(w * dpr);
    this.canvasElement.height = Math.round(h * dpr);
    const ctx = this.canvasElement.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Get canvas display size (CSS size, not backing buffer size)
   * @returns {{width: number, height: number}}
   */
  getCanvasDisplaySize() {
    const r = this.canvasElement.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height) };
  }

  /**
   * Render the combined metrics panel with all measurements
   * @param {Object} state - Measurement state object
   * @param {number|null} distanceCm - Camera distance in centimeters
   */
  renderMetricsPanel(state, distanceCm) {
    if (!this.metricsPanelEl || !this.metricsPanelBodyEl) return;

    // Distance card
    const distanceCard = `
      <div class="metric-card">
        <h2>Camera</h2>
        <div class="metric-row"><span class="label">Distance</span><span class="value">${formatCm(distanceCm)}</span></div>
      </div>`;

    // Face card
    const face = state.faceWidth;
    const faceCard = `
      <div class="metric-card">
        <h2>Face</h2>
        <div class="metric-row"><span class="label">Width</span><span class="value">${formatMm(face?.valueMm)}</span></div>
      </div>`;

    // Eyes card
    const eyes = state.eyes || {};
    const leftEye = eyes.left;
    const rightEye = eyes.right;
    const eyesCard = `
      <div class="metric-card">
        <h2>Eyes</h2>
        <div class="metric-row"><span class="label">Left width</span><span class="value">${formatMm(leftEye?.valueMm)}</span></div>
        <div class="metric-row"><span class="label">Right width</span><span class="value">${formatMm(rightEye?.valueMm)}</span></div>
      </div>`;

    // IPD card
    const ipd = state.ipd;
    let ipdRows = "";
    if (ipd && Array.isArray(IPD_OVERLAY_CONFIG.rails)) {
      const ipdColors = COLOR_CONFIG.ipd || {};
      ipdRows = IPD_OVERLAY_CONFIG.rails
        .map(({ key, label }) => {
          const val = formatMm(ipd?.[key]);
          const color = safeColor(ipdColors[key]);
          return `<div class="metric-row" style="color:${color}"><span class="label">${label}</span><span class="value">${val}</span></div>`;
        })
        .join("");
    }
    const ipdCard = `
      <div class="metric-card">
        <h2>IPD</h2>
        ${ipdRows || `<div class="metric-row"><span class="label">Values</span><span class="value">--</span></div>`}
      </div>`;

    // Nose card
    const NM = state.nose || {};
    const NCLR = COLOR_CONFIG.noseMetrics || {};
    const noseCard = `
      <div class="metric-card">
        <h2>Nose</h2>
        <div class="metric-row" style="color:${safeColor(NCLR.bridge)}"><span class="label">Bridge width</span><span class="value">${formatMm(NM.bridgeWidthMm)}</span></div>
        <div class="metric-row" style="color:${safeColor(NCLR.padSpan)}"><span class="label">Pad width</span><span class="value">${formatMm(NM.padSpanMm)}</span></div>
        <div class="metric-row" style="color:${safeColor(NCLR.padHeight)}"><span class="label">Pad height</span><span class="value">${formatMm(NM.padHeightMm)}</span></div>
        <div class="metric-row" style="color:${safeColor(NCLR.padAngle)}"><span class="label">Pad angle</span><span class="value">${formatDeg(NM.padAngleDeg)}</span></div>
        <div class="metric-row" style="color:${safeColor(NCLR.flareAngle)}"><span class="label">Flare angle</span><span class="value">${formatDeg(NM.flareAngleDeg)}</span></div>
      </div>`;

    this.metricsPanelBodyEl.innerHTML = distanceCard + faceCard + eyesCard + ipdCard + noseCard;
  }

  /**
   * Setup all event listeners with provided callbacks
   * @param {Object} callbacks - Object containing callback functions
   * @param {Function} callbacks.onFocusChange - Called when focus radio changes
   * @param {Function} callbacks.onMirrorToggle - Called when mirror toggle changes
   */
  setupEventListeners(callbacks) {
    this.callbacks = callbacks;

    // Focus radio buttons
    document.querySelectorAll('input[name="focus"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (callbacks.onFocusChange) {
          callbacks.onFocusChange(e.target.value);
        }
      });
    });

    // Mirror toggle
    if (this.mirrorToggleEl && callbacks.onMirrorToggle) {
      this.mirrorToggleEl.addEventListener("change", (event) => {
        callbacks.onMirrorToggle(Boolean(event.target?.checked));
      });
    }

    // Window resize
    window.addEventListener("resize", () => this.resizeDisplayToContainer());
  }

  /**
   * Apply mirror setting to video element
   * @param {boolean} enabled - Whether mirroring is enabled
   */
  applyMirrorSetting(enabled) {
    if (this.mirrorToggleEl) {
      this.mirrorToggleEl.checked = enabled;
    }
    if (this.video) {
      this.video.classList.toggle("mirrored", enabled);
    }
    this.mirrorPanelEl?.classList.add("visible");
  }

  /**
   * Clear the canvas
   */
  clearCanvas() {
    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
  }
}
