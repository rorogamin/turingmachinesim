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
   */
  buildDiagram(sim = null) {
    if (sim) this.sim = sim;
    if (!this.sim || !this.sim.history) return;

    const { totalSteps, headHistory, writeHistory, minNonZeroX, maxNonZeroX, minHeadPos, maxHeadPos, initialCells } = this.sim.history;
    const numSymbols = this.sim.spec.numSymbols;
    const maxSymbol = Math.max(1, numSymbols - 1);

    const maxLimit = (this.sim.stats && this.sim.stats.maxStepsLimit) ? this.sim.stats.maxStepsLimit : totalSteps;
    const effectiveSteps = (this.padToLimit && maxLimit > totalSteps) ? Math.min(maxLimit, 500000) : totalSteps;
    this.totalSteps = effectiveSteps;

    // Horizontal tape bounds
    if (this.framingMode === 'nonzeros' && minNonZeroX !== undefined && maxNonZeroX !== undefined && minNonZeroX <= maxNonZeroX) {
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

    // Cap vertical buffer height to TARGET_HEIGHT (768) to prevent browser canvas height overflow (>32767)
    const H_target = this.TARGET_HEIGHT;
    const H_raw = Math.min(effectiveSteps + 1, H_target);

    // 1. Build unscaled buffer (at most 768 rows)
    this.rawCanvas.width = W_cells;
    this.rawCanvas.height = H_raw;

    const imgData = this.rawCtx.createImageData(W_cells, H_raw);
    const pixelBuffer = new Uint32Array(imgData.data.buffer);

    // Color lookup table
    const theme = this.themes[this.currentTheme] || this.themes.monochrome;
    const colorLut = new Uint32Array(numSymbols + 1);
    for (let s = 0; s <= numSymbols; s++) {
      const rgb = theme.palette(s, maxSymbol);
      // Little-endian 0xAABBGGRR
      colorLut[s] = 0xFF000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
    }
    const blankColor = colorLut[0];

    // Initialize Row 0
    pixelBuffer.fill(blankColor, 0, W_cells);
    for (const cell of initialCells) {
      const col = cell.pos - this.minTapeX;
      if (col >= 0 && col < W_cells) {
        const sym = cell.symbol;
        pixelBuffer[col] = colorLut[sym >= numSymbols ? numSymbols : sym];
      }
    }

    const historyLen = writeHistory ? writeHistory.length : 0;

    if (effectiveSteps + 1 <= H_target) {
      // 1-to-1 exact row per step
      for (let t = 1; t < H_raw; t++) {
        const prevRowStart = (t - 1) * W_cells;
        const currRowStart = t * W_cells;
        pixelBuffer.copyWithin(currRowStart, prevRowStart, prevRowStart + W_cells);

        const stepIdx = t - 1;
        if (stepIdx < totalSteps && stepIdx < historyLen) {
          const writePos = headHistory[stepIdx] - this.minTapeX;
          const writtenSym = writeHistory[stepIdx];
          if (writePos >= 0 && writePos < W_cells) {
            pixelBuffer[currRowStart + writePos] = colorLut[writtenSym >= numSymbols ? numSymbols : writtenSym];
          }
        }
      }
    } else {
      // Large run (> 768 steps): sample exactly H_raw rows, integrating all intermediate writes
      let lastStep = 0;
      for (let y = 1; y < H_raw; y++) {
        const currStep = Math.min(effectiveSteps, Math.floor((y / (H_raw - 1)) * effectiveSteps));
        const prevRowStart = (y - 1) * W_cells;
        const currRowStart = y * W_cells;
        pixelBuffer.copyWithin(currRowStart, prevRowStart, prevRowStart + W_cells);

        // Apply all writes in [lastStep, currStep)
        const limitS = Math.min(currStep, totalSteps, historyLen);
        for (let s = lastStep; s < limitS; s++) {
          const writePos = headHistory[s] - this.minTapeX;
          const writtenSym = writeHistory[s];
          if (writePos >= 0 && writePos < W_cells) {
            pixelBuffer[currRowStart + writePos] = colorLut[writtenSym >= numSymbols ? numSymbols : writtenSym];
          }
        }
        lastStep = currStep;
      }
    }

    this.rawCtx.putImageData(imgData, 0, 0);

    // 2. Scale exactly to 512 wide x 768 tall (no grid, crisp nearest-neighbor)
    this.offscreenCanvas.width = this.TARGET_WIDTH;
    this.offscreenCanvas.height = this.TARGET_HEIGHT;

    this.offscreenCtx.imageSmoothingEnabled = false;
    this.offscreenCtx.fillStyle = theme.background;
    this.offscreenCtx.fillRect(0, 0, this.TARGET_WIDTH, this.TARGET_HEIGHT);

    this.offscreenCtx.drawImage(
      this.rawCanvas,
      0, 0, W_cells, H_raw,
      0, 0, this.TARGET_WIDTH, this.TARGET_HEIGHT
    );
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
    ctx.drawImage(this.offscreenCanvas, 0, 0);

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

      for (let t = 0; t <= totalSteps; t++) {
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
