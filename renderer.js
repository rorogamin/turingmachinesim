/**
 * Space-Time Diagram Renderer
 * High-performance Canvas renderer for Turing Machine spacetime diagrams.
 * - No grid lines (pure raw pixels).
 * - Grayscale: Black is 0, highest symbol is White, intermediate are shades of gray.
 * - Themeable: Monochrome (default), Amber CRT, Matrix Green, Cyberpunk, etc.
 * - Interactive Pan/Zoom, High-DPI support, Head trajectory overlay, and Explore marker.
 */

class SpaceTimeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false });

    // Offscreen buffer for rendered spacetime diagram
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');

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
          // Gradient from deep violet/magenta to bright cyan
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
          if (s === 0) return [248, 249, 250]; // White
          const v = Math.round(255 * (1 - s / max));
          return [v, v, v]; // Charcoal to Black
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
    this.exploreStep = null; // Step currently inspected in explore mode

    // Diagram dimensions
    this.diagramWidth = 0;
    this.diagramHeight = 0;
    this.minTapeX = 0;
    this.maxTapeX = 0;

    // Stored simulator reference
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
   * Build the 2D space-time diagram image buffer from simulator history.
   * Runs in milliseconds using typed array copyWithin.
   */
  buildDiagram(sim = null) {
    if (sim) this.sim = sim;
    if (!this.sim || !this.sim.history) return;

    const { totalSteps, headHistory, writeHistory, minHeadPos, maxHeadPos, initialCells } = this.sim.history;
    const numSymbols = this.sim.spec.numSymbols;
    const maxSymbol = Math.max(1, numSymbols - 1);

    // Padding on sides
    const padding = 2;
    this.minTapeX = minHeadPos - padding;
    this.maxTapeX = maxHeadPos + padding;
    this.diagramWidth = this.maxTapeX - this.minTapeX + 1;
    this.diagramHeight = totalSteps + 1;

    const W = this.diagramWidth;
    const H = Math.min(this.diagramHeight, 32767); // Safe browser canvas size

    this.offscreenCanvas.width = W;
    this.offscreenCanvas.height = H;

    const imgData = this.offscreenCtx.createImageData(W, H);
    const pixelBuffer = new Uint32Array(imgData.data.buffer);

    // Generate color lookup table for symbols
    const theme = this.themes[this.currentTheme] || this.themes.monochrome;
    const colorLut = new Uint32Array(numSymbols + 1);
    for (let s = 0; s <= numSymbols; s++) {
      const rgb = theme.palette(s, maxSymbol);
      // Little-endian RGBA: alpha in top byte
      pixelBuffer[0] = 0;
      colorLut[s] = 0xFF000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
    }

    const blankColor = colorLut[0];

    // Initialize Row 0 (Blank + Initial Tape cells)
    pixelBuffer.fill(blankColor, 0, W);
    for (const cell of initialCells) {
      const col = cell.pos - this.minTapeX;
      if (col >= 0 && col < W) {
        const sym = cell.symbol;
        pixelBuffer[col] = colorLut[sym >= numSymbols ? numSymbols : sym];
      }
    }

    // Incremental generation: each row t is row t-1 with 1 write changed!
    for (let t = 1; t < H; t++) {
      const prevRowStart = (t - 1) * W;
      const currRowStart = t * W;
      pixelBuffer.copyWithin(currRowStart, prevRowStart, prevRowStart + W);

      // Apply write from step t-1
      const writePos = headHistory[t - 1] - this.minTapeX;
      const writtenSym = writeHistory[t - 1];
      if (writePos >= 0 && writePos < W) {
        pixelBuffer[currRowStart + writePos] = colorLut[writtenSym >= numSymbols ? numSymbols : writtenSym];
      }
    }

    this.offscreenCtx.putImageData(imgData, 0, 0);
  }

  /**
   * Fit diagram into canvas viewport cleanly
   */
  fitView(mode = 'fit') {
    if (!this.diagramWidth || !this.diagramHeight) return;
    const rect = this.canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;

    if (mode === 'fitWidth') {
      this.zoom = Math.max(0.01, (cw - 40) / this.diagramWidth);
      this.panX = (cw - this.diagramWidth * this.zoom) / 2;
      this.panY = 20;
    } else if (mode === 'actual') {
      this.zoom = 1.0;
      this.panX = (cw - this.diagramWidth) / 2;
      this.panY = 20;
    } else {
      // Fit both
      const scaleX = (cw - 40) / this.diagramWidth;
      const scaleY = (ch - 40) / this.diagramHeight;
      this.zoom = Math.min(scaleX, scaleY, 15);
      if (this.zoom <= 0) this.zoom = 1;
      this.panX = (cw - this.diagramWidth * this.zoom) / 2;
      this.panY = (ch - this.diagramHeight * this.zoom) / 2;
    }
    this.render();
  }

  /**
   * Main render loop
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
      ctx.fillText('No Turing Machine simulation run yet. Click Run to simulate.', width / 2, height / 2);
      ctx.restore();
      return;
    }

    // Disable smoothing for sharp raw pixel diagram without blur or grid
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Draw space-time diagram offscreen buffer
    ctx.drawImage(this.offscreenCanvas, 0, 0);

    // Optional Head Trajectory overlay
    if (this.showTrajectory && this.sim.history) {
      const { headHistory, totalSteps } = this.sim.history;
      ctx.beginPath();
      ctx.strokeStyle = theme.headColor;
      ctx.lineWidth = Math.max(0.5, 1 / this.zoom);
      for (let t = 0; t <= totalSteps; t++) {
        const x = headHistory[t] - this.minTapeX + 0.5;
        const y = t + 0.5;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Explore mode marker
    if (this.exploreStep !== null && this.exploreStep >= 0 && this.sim.history) {
      const t = this.exploreStep;
      const headX = this.sim.history.headHistory[t] - this.minTapeX;

      // Highlight row line
      ctx.fillStyle = theme.markerColor;
      ctx.fillRect(0, t, this.diagramWidth, Math.max(1, 1 / this.zoom));

      // Highlight head position cell
      ctx.strokeStyle = theme.headColor;
      ctx.lineWidth = Math.max(1, 2 / this.zoom);
      ctx.strokeRect(headX, t, 1, 1);
    }

    ctx.restore();
    ctx.restore();
  }

  /**
   * Handle user panning, zooming, and explore clicks
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

    // Zoom with mouse wheel
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.min(Math.max(0.01, this.zoom * zoomFactor), 80);

      // Zoom centered on mouse pointer
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.render();
    }, { passive: false });

    // Click to seek in Explore Mode
    this.canvas.addEventListener('click', (e) => {
      if (!this.sim || !this.sim.history) return;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Transform screen to diagram coordinates
      const diagY = Math.floor((mouseY - this.panY) / this.zoom);
      if (diagY >= 0 && diagY <= this.sim.history.totalSteps) {
        if (this.onStepSelect) {
          this.onStepSelect(diagY);
        }
      }
    });
  }

  /**
   * Export high resolution PNG of space-time diagram
   */
  exportPNG() {
    if (!this.offscreenCanvas || !this.offscreenCanvas.width) return;
    const link = document.createElement('a');
    link.download = `spacetime-diagram-${Date.now()}.png`;
    link.href = this.offscreenCanvas.toDataURL('image/png');
    link.click();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SpaceTimeRenderer };
}
