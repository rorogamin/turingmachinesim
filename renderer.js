/**
 * Space-Time Diagram Renderer
 * High-performance Canvas renderer for Turing Machine spacetime diagrams.
 * - Dimensions: 512 wide x 768 tall.
 * - Framing: The end of the non-zeros fills the full diagram.
 * - No grid lines (pure raw pixels).
 * - Grayscale: Black is 0, highest symbol is White, intermediate are shades of gray.
 * - Themeable: Monochrome (default), Amber CRT, Matrix Green, Cyberpunk, etc.
 * - Interactive Pan/Zoom, High-DPI support, Head trajectory overlay, and Explore marker.
 */

class SpaceTimeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false });

    // Target dimensions requested: 512 wide x 768 tall
    this.TARGET_WIDTH = 512;
    this.TARGET_HEIGHT = 768;

    // Offscreen buffer for scaled 512x768 spacetime diagram
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.TARGET_WIDTH;
    this.offscreenCanvas.height = this.TARGET_HEIGHT;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: false });

    // Raw unscaled canvas buffer
    this.rawCanvas = document.createElement('canvas');
    this.rawCtx = this.rawCanvas.getContext('2d', { willReadFrequently: false });

    // Framing mode: 'nonzeros' (the end of the nonzeros is the full diagram) vs 'all'
    this.framingMode = 'nonzeros';
    this.padToLimit = false; // Option to extend diagram height to step limit even if halted early

    // Theme definitions
    this.themes = {
      monochrome: {
        name: 'Monochrome (Black=0, White=Max)',
        background: '#000000',
        palette: (s, max) => {
          if (max === 0) return [0, 0, 0];
          const v = Math.round((s / max) * 255);
          return [v, v, v]; // Black to White
        },
        headColor: '#ff2d55',
        markerColor: 'rgba(0, 229, 255, 0.85)',
      },
      amber: {
        name: 'Amber CRT Phosphor',
        background: '#0a0700',
        palette: (s, max) => {
          if (s === 0) return [10, 7, 0];
          const f = s / max;
          return [Math.round(255 * f), Math.round(176 * f), Math.round(10 * f)];
        },
        headColor: '#00ffff',
        markerColor: 'rgba(255, 200, 0, 0.9)',
      },
      matrix: {
        name: 'Matrix Green Terminal',
        background: '#000a04',
        palette: (s, max) => {
          if (s === 0) return [0, 10, 4];
          const f = s / max;
          return [Math.round(20 * f), Math.round(255 * f), Math.round(80 * f)];
        },
        headColor: '#ff007f',
        markerColor: 'rgba(0, 255, 100, 0.9)',
      },
      cyberpunk: {
        name: 'Cyberpunk Neon',
        background: '#0b001a',
        palette: (s, max) => {
          if (s === 0) return [11, 0, 26];
          const f = s / max;
          const r = Math.round(255 * (1 - f * 0.8));
          const g = Math.round(240 * f);
          const b = Math.round(255 * f);
          return [r, g, b];
        },
        headColor: '#ffff00',
        markerColor: 'rgba(255, 0, 128, 0.9)',
      },
      solarized: {
        name: 'Solarized Dark',
        background: '#002b36',
        palette: (s, max) => {
          if (s === 0) return [0, 43, 54];
          const f = s / max;
          const r = Math.round(42 + (253 - 42) * f);
          const g = Math.round(161 + (246 - 161) * f);
          const b = Math.round(152 + (227 - 152) * f);
          return [r, g, b];
        },
        headColor: '#dc322f',
        markerColor: 'rgba(38, 139, 210, 0.9)',
      },
      synthwave: {
        name: 'Synthwave 80s',
        background: '#130424',
        palette: (s, max) => {
          if (s === 0) return [19, 4, 36];
          const f = s / max;
          return [Math.round(255 * f), Math.round(60 * f), Math.round(180 * f + 75 * (1 - f))];
        },
        headColor: '#00ffff',
        markerColor: 'rgba(255, 42, 133, 0.9)',
      },
      blueprint: {
        name: 'Blueprint CAD',
        background: '#06142e',
        palette: (s, max) => {
          if (s === 0) return [6, 20, 46];
          const f = s / max;
          return [Math.round(200 + 55 * f), Math.round(225 + 30 * f), 255];
        },
        headColor: '#ff9900',
        markerColor: 'rgba(100, 200, 255, 0.9)',
      },
      paper: {
        name: 'Paper Light (Inverted)',
        background: '#f8f9fa',
        palette: (s, max) => {
          if (s === 0) return [248, 249, 250];
          const v = Math.round(255 * (1 - s / max));
          return [v, v, v];
        },
        headColor: '#d63384',
        markerColor: 'rgba(13, 110, 253, 0.9)',
      },
    };

    this.currentTheme = 'monochrome';

    // Viewport transform (zoom & pan)
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Display options
    this.showTrajectory = false;
    this.exploreStep = null;

    // Active tape bounds for diagram
    this.minTapeX = 0;
    this.maxTapeX = 0;
    this.tapeSpan = 0;
    this.totalSteps = 0;

    this.sim = null;
    this.setupInteraction();
  }

  setTheme(themeKey) {
    if (this.themes[themeKey]) {
      this.currentTheme = themeKey;
      if (this.sim && this.sim.history) {
        this.buildDiagram();
        this.render();
      }
    }
  }

  /**
   * Build the 512 wide x 768 tall space-time diagram image.
   * Framed so the end of the non-zeros is the full diagram.
   * Supports streaming rendering with progress frontier.
   */
  buildDiagram(sim = null, isStreaming = false) {
    if (sim) this.sim = sim;
    if (!this.sim || !this.sim.history) return;

    const { totalSteps, headHistory, writeHistory, minNonZeroX, maxNonZeroX, minHeadPos, maxHeadPos, initialCells } = this.sim.history;
    const numSymbols = this.sim.spec.numSymbols;
    const maxSymbol = Math.max(1, numSymbols - 1);

    const maxLimit = (this.sim.stats && this.sim.stats.maxStepsLimit) ? this.sim.stats.maxStepsLimit : totalSteps;
    const effectiveSteps = (this.padToLimit && maxLimit > totalSteps) ? Math.min(maxLimit, 50000000) : totalSteps;
    this.totalSteps = effectiveSteps;

    // Horizontal tape bounds
    if (!isStreaming && this.framingMode === 'nonzeros' && minNonZeroX !== undefined && maxNonZeroX !== undefined && minNonZeroX <= maxNonZeroX) {
      this.minTapeX = minNonZeroX;
      this.maxTapeX = maxNonZeroX;
    } else {
      this.minTapeX = minHeadPos !== undefined ? minHeadPos : 0;
      this.maxTapeX = maxHeadPos !== undefined ? maxHeadPos : 0;
    }

    // Ensure span is at least 1 cell
    if (this.minTapeX >= this.maxTapeX) {
      this.minTapeX -= 1;
      this.maxTapeX += 1;
    }

    this.tapeSpan = this.maxTapeX - this.minTapeX + 1;
    const W_cells = this.tapeSpan;
    const H_target = this.TARGET_HEIGHT; // 768
    const W_target = this.TARGET_WIDTH;  // 512

    const theme = this.themes[this.currentTheme] || this.themes.monochrome;
    const rgb0 = theme.palette(0, maxSymbol);
    const rgbMax = theme.palette(maxSymbol, maxSymbol);

    // Color mapper for continuous density [0, 1] (area-averaging / binning)
    const getDensityColor = (density) => {
      if (density <= 0) {
        return 0xFF000000 | (rgb0[2] << 16) | (rgb0[1] << 8) | rgb0[0];
      }
      // Gamma 2.0 boost to make fine lines / period-3 stripes clearly visible
      const f = Math.min(1.0, Math.max(0.12, Math.pow(density, 0.5)));
      const r = Math.round(rgb0[0] + (rgbMax[0] - rgb0[0]) * f);
      const g = Math.round(rgb0[1] + (rgbMax[1] - rgb0[1]) * f);
      const b = Math.round(rgb0[2] + (rgbMax[2] - rgb0[2]) * f);
      return 0xFF000000 | (b << 16) | (g << 8) | r;
    };

    // Color lookup table for discrete symbols
    const colorLut = new Uint32Array(numSymbols + 1);
    for (let s = 0; s <= numSymbols; s++) {
      const rgb = theme.palette(s, maxSymbol);
      colorLut[s] = 0xFF000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
    }
    const blankColor = colorLut[0];

    const { rowSnapshots, nextSnapshotRow } = this.sim.history || {};
    const totalCaptured = (nextSnapshotRow !== undefined) ? nextSnapshotRow : (rowSnapshots ? rowSnapshots.length : 0);
    const completedRows = isStreaming ? Math.min(totalCaptured, H_target) : H_target;

    this.offscreenCanvas.width = W_target;
    this.offscreenCanvas.height = H_target;
    const offImgData = this.offscreenCtx.createImageData(W_target, H_target);
    const binnedPixels = new Uint32Array(offImgData.data.buffer);
    binnedPixels.fill(blankColor);

    const W_raw = Math.min(span, 16384);
    this.rawCanvas.width = W_raw;
    this.rawCanvas.height = H_target;
    const rawImgData = this.rawCtx.createImageData(W_raw, H_target);
    const rawPixels = new Uint32Array(rawImgData.data.buffer);
    rawPixels.fill(blankColor);

    // Map canvas row y (0..H_target-1) to snapshot index
    const mapYToSnap = (y) => {
      if (isStreaming || this.padToLimit || totalCaptured >= H_target) {
        return Math.min(totalCaptured - 1, Math.floor((y / (H_target - 1)) * (H_target - 1)));
      }
      return Math.min(totalCaptured - 1, Math.floor((y / (H_target - 1)) * (totalCaptured - 1)));
    };

    for (let y = 0; y < completedRows; y++) {
      const snapIdx = mapYToSnap(y);
      const snap = (rowSnapshots && snapIdx >= 0) ? rowSnapshots[snapIdx] : null;
      if (!snap) continue;

      const rowOffsetBinned = y * W_target;
      const rowOffsetRaw = y * W_raw;
      const { minP, slice } = snap;
      const sliceLen = slice.length;

      // 1. Raw discrete cells for crisp zoomed-in inspection
      for (let x = 0; x < W_raw; x++) {
        const c = minX + Math.floor((x / W_raw) * span);
        const offset = c - minP;
        const sym = (offset >= 0 && offset < sliceLen) ? slice[offset] : 0;
        rawPixels[rowOffsetRaw + x] = colorLut[sym >= numSymbols ? numSymbols : sym];
      }

      // 2. Binned area-averaged pixels (preserves period-3 stripes between parabolas)
      for (let x = 0; x < W_target; x++) {
        const cellStart = minX + Math.floor((x / W_target) * span);
        const cellEnd = minX + Math.floor(((x + 1) / W_target) * span);
        const count = Math.max(1, cellEnd - cellStart);
        let sum = 0;
        for (let c = cellStart; c < cellEnd; c++) {
          const offset = c - minP;
          if (offset >= 0 && offset < sliceLen) sum += slice[offset];
        }
        binnedPixels[rowOffsetBinned + x] = sum > 0 ? getDensityColor(sum / count) : blankColor;
      }
    }

    this.offscreenCtx.putImageData(offImgData, 0, 0);
    this.rawCtx.putImageData(rawImgData, 0, 0);

    // If streaming, draw subtle progress scanline at the frontier
    if (isStreaming && completedRows < H_target) {
      this.offscreenCtx.fillStyle = theme.markerColor;
      this.offscreenCtx.fillRect(0, completedRows, W_target, 2);
    }
  }

  /**
   * Reset / Fit view to 512 x 768
   */
  fitView(mode = 'fit') {
    const rect = this.canvas.getBoundingClientRect();
    const cw = rect.width || this.TARGET_WIDTH;
    const ch = rect.height || this.TARGET_HEIGHT;

    if (mode === 'actual') {
      this.zoom = 1.0;
      this.panX = (cw - this.TARGET_WIDTH) / 2;
      this.panY = (ch - this.TARGET_HEIGHT) / 2;
    } else {
      const scaleX = (cw - 24) / this.TARGET_WIDTH;
      const scaleY = (ch - 24) / this.TARGET_HEIGHT;
      this.zoom = Math.min(scaleX, scaleY, 1.0);
      if (this.zoom <= 0) this.zoom = 1.0;
      this.panX = (cw - this.TARGET_WIDTH * this.zoom) / 2;
      this.panY = (ch - this.TARGET_HEIGHT * this.zoom) / 2;
    }
    this.render();
  }

  /**
   * Render onto main canvas
   */
  render() {
    const canvas = this.canvas;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const theme = this.themes[this.currentTheme] || this.themes.monochrome;
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);

    if (!this.sim || !this.sim.history || !this.offscreenCanvas.width) {
      ctx.fillStyle = '#666';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No Turing Machine simulation run yet. Click Run Simulation.', width / 2, height / 2);
      ctx.restore();
      return;
    }

    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Draw the 512 x 768 diagram
    // When zoomed in (zoom > 1.5), draw from high-res rawCanvas for crisp discrete cell and line inspection!
    if (this.zoom > 1.5 && this.rawCanvas && this.rawCanvas.width > 0 && this.rawCanvas.height > 0) {
      ctx.drawImage(this.rawCanvas, 0, 0, this.TARGET_WIDTH, this.TARGET_HEIGHT);
    } else {
      ctx.drawImage(this.offscreenCanvas, 0, 0);
    }

    // Subtle crisp border around diagram
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 / this.zoom;
    ctx.strokeRect(0, 0, this.TARGET_WIDTH, this.TARGET_HEIGHT);

    // Optional Head Trajectory overlay
    if (this.showTrajectory && this.sim.history && this.tapeSpan > 0 && this.totalSteps > 0) {
      const { headHistory, totalSteps } = this.sim.history;
      ctx.beginPath();
      ctx.strokeStyle = theme.headColor;
      ctx.lineWidth = Math.max(1, 2 / this.zoom);

      const stride = Math.max(1, Math.floor(totalSteps / 40000));
      for (let t = 0; t <= totalSteps; t += stride) {
        const normX = (headHistory[t] - this.minTapeX + 0.5) / this.tapeSpan;
        const normY = (t + 0.5) / (totalSteps + 1);
        const x = normX * this.TARGET_WIDTH;
        const y = normY * this.TARGET_HEIGHT;

        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Explore Mode Marker
    if (this.exploreStep !== null && this.exploreStep >= 0 && this.sim.history && this.tapeSpan > 0) {
      const t = this.exploreStep;
      const headX = this.sim.history.headHistory[t];

      const normY = t / (this.totalSteps + 1);
      const rowY = normY * this.TARGET_HEIGHT;
      const rowH = Math.max(2, this.TARGET_HEIGHT / (this.totalSteps + 1));

      // Row indicator line
      ctx.fillStyle = theme.markerColor;
      ctx.fillRect(0, rowY, this.TARGET_WIDTH, rowH);

      // Head cell box
      const normHead = (headX - this.minTapeX) / this.tapeSpan;
      const cellW = this.TARGET_WIDTH / this.tapeSpan;
      ctx.strokeStyle = theme.headColor;
      ctx.lineWidth = Math.max(1.5, 2 / this.zoom);
      ctx.strokeRect(normHead * this.TARGET_WIDTH, rowY, cellW, rowH);
    }

    ctx.restore();
    ctx.restore();
  }

  /**
   * User interaction: zoom, pan, and click to seek in explore mode
   */
  setupInteraction() {
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isDragging = true;
        startX = e.clientX - this.panX;
        startY = e.clientY - this.panY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        this.panX = e.clientX - startX;
        this.panY = e.clientY - startY;
        this.render();
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.min(Math.max(0.1, this.zoom * zoomFactor), 40);

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.render();
    }, { passive: false });

    this.canvas.addEventListener('click', (e) => {
      if (!this.sim || !this.sim.history || this.totalSteps <= 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Transform click to diagram coordinate (0 to TARGET_HEIGHT)
      const diagY = (mouseY - this.panY) / this.zoom;
      if (diagY >= 0 && diagY <= this.TARGET_HEIGHT) {
        const step = Math.min(this.totalSteps, Math.max(0, Math.round((diagY / this.TARGET_HEIGHT) * this.totalSteps)));
        if (this.onStepSelect) {
          this.onStepSelect(step);
        }
      }
    });
  }

  /**
   * Export high-resolution 512 x 768 PNG image
   */
  exportPNG() {
    if (!this.offscreenCanvas || !this.offscreenCanvas.width) return;
    const link = document.createElement('a');
    link.download = `spacetime-512x768-${Date.now()}.png`;
    link.href = this.offscreenCanvas.toDataURL('image/png');
    link.click();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SpaceTimeRenderer };
}
