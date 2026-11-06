/**
 * Application Controller for Turing Machine Simulator
 * Handles UI interactions, explore mode, table editor, and tape presets.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const bbInput = document.getElementById('bb-input');
  const presetSelect = document.getElementById('preset-select');
  const themeSelect = document.getElementById('theme-select');
  const maxStepsInput = document.getElementById('max-steps');
  const startTapeInput = document.getElementById('start-tape-input');
  const headPosInput = document.getElementById('head-pos-input');
  const startStateSelect = document.getElementById('start-state-select');

  const btnRun = document.getElementById('btn-run');
  const btnExplore = document.getElementById('btn-explore');
  const btnFit = document.getElementById('btn-fit');
  const btnFitWidth = document.getElementById('btn-fit-width');
  const btnActual = document.getElementById('btn-actual');
  const btnExport = document.getElementById('btn-export');
  const toggleTrajectory = document.getElementById('toggle-trajectory');
  const togglePadLimit = document.getElementById('toggle-pad-limit');
  const framingSelect = document.getElementById('framing-select');

  // Stats Elements
  const statSteps = document.getElementById('stat-steps');
  const statStatus = document.getElementById('stat-status');
  const statNonzeros = document.getElementById('stat-nonzeros');
  const statSpan = document.getElementById('stat-span');
  const statSpeed = document.getElementById('stat-speed');
  const statTime = document.getElementById('stat-time');

  // Table Matrix Elements
  const tableContainer = document.getElementById('transition-table-container');
  const btnAddState = document.getElementById('btn-add-state');
  const btnRemoveState = document.getElementById('btn-remove-state');
  const btnAddSymbol = document.getElementById('btn-add-symbol');
  const btnRemoveSymbol = document.getElementById('btn-remove-symbol');

  // Explore Panel Elements
  const explorePanel = document.getElementById('explore-panel');
  const exploreSlider = document.getElementById('explore-slider');
  const exploreStepDisplay = document.getElementById('explore-step-display');
  const exploreHeadPos = document.getElementById('explore-head-pos');
  const exploreState = document.getElementById('explore-state');
  const exploreSymbol = document.getElementById('explore-symbol');
  const exploreRule = document.getElementById('explore-rule');
  const exploreNonzeros = document.getElementById('explore-nonzeros');
  const exploreSpan = document.getElementById('explore-span');
  const tapeRibbon = document.getElementById('tape-ribbon');

  // Playback Controls
  const btnPlay = document.getElementById('btn-play');
  const btnStepBack = document.getElementById('btn-step-back');
  const btnStepFwd = document.getElementById('btn-step-fwd');
  const btnJumpStart = document.getElementById('btn-jump-start');
  const btnJumpEnd = document.getElementById('btn-jump-end');
  const playSpeedSelect = document.getElementById('play-speed-select');

  // Tape Quick Buttons
  const tapeQuickBlank = document.getElementById('tape-quick-blank');
  const tapeQuickUnary = document.getElementById('tape-quick-unary');
  const tapeQuickBinary = document.getElementById('tape-quick-binary');
  const tapeQuickAlternating = document.getElementById('tape-quick-alternating');
  const tapeQuickRandom = document.getElementById('tape-quick-random');

  // Canvas & Renderer Initialization
  const canvas = document.getElementById('spacetime-canvas');
  const renderer = new SpaceTimeRenderer(canvas);
  let simulator = new TuringMachineSimulator();

  // Presets definition
  const PRESETS = {
    'bb2': {
      name: 'BB(2) Champion (6 steps, 4 ones)',
      code: '1RB1LB_1LA1RZ',
      steps: 50,
      tape: '0',
    },
    'bb3': {
      name: 'BB(3) Champion (21 steps, 5 ones)',
      code: '1RB1RZ_1LB0RC_1LC1LA',
      steps: 100,
      tape: '0',
    },
    'bb4': {
      name: 'BB(4) Champion (107 steps, 13 ones)',
      code: '1RB1LB_1LA0LC_1RZ1LD_1RD0RA',
      steps: 500,
      tape: '0',
    },
    'bb5': {
      name: 'BB(5) Champion (Marxen & Buntrock - 47M steps)',
      code: '1RB1LC_1RC1RB_1RD0LE_1LA1LD_1RZ0LA',
      steps: 15000,
      tape: '0',
    },
    'bb23': {
      name: 'BB(2,3) Champion (38 steps, 9 non-zeros)',
      code: '1RB2LB1RZ_2LA2RB1LB',
      steps: 100,
      tape: '0',
    },
    'antihydra': {
      name: 'Antihydra (Collatz-like behaviour)',
      code: '1RB1RA_0LC1LE_1LD1LC_1LA0LB_1LF1RE_---0RA',
      steps: 10000,
      tape: '0',
    },
    'counter': {
      name: 'Binary Incrementer',
      code: '1RB0LB_1LA1RZ',
      steps: 100,
      tape: '1101',
    },
    'oscillator': {
      name: 'Ping-Pong Oscillator',
      code: '1RB1LB_1LA1RA',
      steps: 1000,
      tape: '0',
    },
    'sierpinski': {
      name: 'Sierpinski Triangle Generator',
      code: '1RB0RA_1LA1LB',
      steps: 3000,
      tape: '1',
    },
  };

  // State
  let isExploreMode = false;
  let isPlaying = false;
  let playInterval = null;
  let currentStep = 0;

  // Initialize
  function init() {
    loadPreset('bb4');
    renderTableFromSpec(simulator.spec);
    runSimulation();

    // Window resize
    window.addEventListener('resize', () => {
      renderer.render();
    });
  }

  // Load Preset
  function loadPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    bbInput.value = p.code;
    maxStepsInput.value = p.steps;
    startTapeInput.value = p.tape || '0';
    try {
      simulator.spec = TuringMachineSimulator.parseBBChallenge(p.code);
      updateStartStateDropdown(simulator.spec.numStates);
      renderTableFromSpec(simulator.spec);
    } catch (e) {
      console.error(e);
    }
  }

  // Update starting state dropdown
  function updateStartStateDropdown(numStates) {
    startStateSelect.innerHTML = '';
    for (let s = 0; s < numStates; s++) {
      const name = String.fromCharCode(65 + s);
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `State ${name}`;
      startStateSelect.appendChild(opt);
    }
  }

  // Render Matrix Transition Table
  function renderTableFromSpec(spec) {
    const { numStates, numSymbols, table, stateNames } = spec;
    tableContainer.innerHTML = '';

    const tbl = document.createElement('table');
    tbl.className = 'transition-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const thCorner = document.createElement('th');
    thCorner.textContent = 'State';
    headerRow.appendChild(thCorner);

    for (let c = 0; c < numSymbols; c++) {
      const th = document.createElement('th');
      th.textContent = `Read ${c}`;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    tbl.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    for (let s = 0; s < numStates; s++) {
      const sName = stateNames[s];
      const tr = document.createElement('tr');

      const thState = document.createElement('td');
      thState.className = 'state-label-cell';
      thState.textContent = sName;
      tr.appendChild(thState);

      const stateRow = table[sName] || [];
      for (let c = 0; c < numSymbols; c++) {
        const td = document.createElement('td');
        td.className = 'transition-cell';
        const cellData = stateRow[c] || { write: 0, dir: 'R', nextState: 'Z', isHalt: true, isUndefined: true };

        const wrapper = document.createElement('div');
        wrapper.className = 'cell-inputs';

        // Write symbol select
        const writeSel = document.createElement('select');
        writeSel.className = 'cell-select cell-write';
        for (let sym = 0; sym < numSymbols; sym++) {
          const opt = document.createElement('option');
          opt.value = sym;
          opt.textContent = sym;
          if (cellData.write === sym) opt.selected = true;
          writeSel.appendChild(opt);
        }

        // Direction select
        const dirSel = document.createElement('select');
        dirSel.className = 'cell-select cell-dir';
        const optR = document.createElement('option');
        optR.value = 'R';
        optR.textContent = 'R';
        if (cellData.dir === 'R') optR.selected = true;
        const optL = document.createElement('option');
        optL.value = 'L';
        optL.textContent = 'L';
        if (cellData.dir === 'L') optL.selected = true;
        dirSel.appendChild(optR);
        dirSel.appendChild(optL);

        // Next State select (A, B, ..., Z=Halt, ---=Undefined)
        const nsSel = document.createElement('select');
        nsSel.className = 'cell-select cell-next-state';
        for (let st = 0; st < numStates; st++) {
          const stName = String.fromCharCode(65 + st);
          const opt = document.createElement('option');
          opt.value = stName;
          opt.textContent = stName;
          if (!cellData.isHalt && !cellData.isUndefined && cellData.nextState === stName) {
            opt.selected = true;
          }
          nsSel.appendChild(opt);
        }
        const optHalt = document.createElement('option');
        optHalt.value = 'Z';
        optHalt.textContent = 'Halt (Z)';
        if (cellData.isHalt && !cellData.isUndefined) optHalt.selected = true;
        nsSel.appendChild(optHalt);

        const optUndef = document.createElement('option');
        optUndef.value = '---';
        optUndef.textContent = '--- (Halt)';
        if (cellData.isUndefined) optUndef.selected = true;
        nsSel.appendChild(optUndef);

        // Event listener for live table edit
        const updateFromCell = () => {
          const nextVal = nsSel.value;
          const isUndef = nextVal === '---';
          const isHalt = nextVal === 'Z' || isUndef;
          stateRow[c] = {
            write: parseInt(writeSel.value, 10),
            dir: dirSel.value,
            nextState: isHalt ? 'Z' : nextVal,
            isHalt,
            isUndefined: isUndef,
          };
          syncTableToBBString();
        };

        writeSel.addEventListener('change', updateFromCell);
        dirSel.addEventListener('change', updateFromCell);
        nsSel.addEventListener('change', updateFromCell);

        wrapper.appendChild(writeSel);
        wrapper.appendChild(dirSel);
        wrapper.appendChild(nsSel);
        td.appendChild(wrapper);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    tableContainer.appendChild(tbl);
  }

  // Sync Table to BB string
  function syncTableToBBString() {
    const str = TuringMachineSimulator.tableToBBChallenge(
      simulator.spec.table,
      simulator.spec.numStates,
      simulator.spec.numSymbols
    );
    bbInput.value = str;
    simulator.spec = TuringMachineSimulator.parseBBChallenge(str);
  }

  // Add / Remove State
  btnAddState.addEventListener('click', () => {
    const cur = simulator.spec.numStates;
    if (cur >= 12) return; // Cap at 12 states A-L
    const newCount = cur + 1;
    const newStateName = String.fromCharCode(65 + cur);
    simulator.spec.stateNames.push(newStateName);
    simulator.spec.numStates = newCount;
    simulator.spec.table[newStateName] = [];
    for (let c = 0; c < simulator.spec.numSymbols; c++) {
      simulator.spec.table[newStateName].push({
        write: 0,
        dir: 'R',
        nextState: 'Z',
        isHalt: true,
        isUndefined: true,
      });
    }
    syncTableToBBString();
    updateStartStateDropdown(newCount);
    renderTableFromSpec(simulator.spec);
  });

  btnRemoveState.addEventListener('click', () => {
    const cur = simulator.spec.numStates;
    if (cur <= 1) return;
    const lastStateName = String.fromCharCode(65 + cur - 1);
    delete simulator.spec.table[lastStateName];
    simulator.spec.stateNames.pop();
    simulator.spec.numStates = cur - 1;
    syncTableToBBString();
    updateStartStateDropdown(cur - 1);
    renderTableFromSpec(simulator.spec);
  });

  // Add / Remove Symbol
  btnAddSymbol.addEventListener('click', () => {
    const cur = simulator.spec.numSymbols;
    if (cur >= 8) return;
    const newSym = cur;
    simulator.spec.numSymbols = cur + 1;
    for (const sName of simulator.spec.stateNames) {
      simulator.spec.table[sName].push({
        write: 0,
        dir: 'R',
        nextState: 'Z',
        isHalt: true,
        isUndefined: true,
      });
    }
    syncTableToBBString();
    renderTableFromSpec(simulator.spec);
  });

  btnRemoveSymbol.addEventListener('click', () => {
    const cur = simulator.spec.numSymbols;
    if (cur <= 2) return;
    simulator.spec.numSymbols = cur - 1;
    for (const sName of simulator.spec.stateNames) {
      simulator.spec.table[sName].pop();
    }
    syncTableToBBString();
    renderTableFromSpec(simulator.spec);
  });

  // Streaming State
  let isStreaming = false;
  let streamAnimationId = null;

  // Run or Stop Simulation (Streaming Engine)
  function toggleSimulation() {
    if (isStreaming) {
      stopStreamingSimulation(true);
    } else {
      startStreamingSimulation();
    }
  }

  function startStreamingSimulation() {
    stopPlayback();
    if (isStreaming) {
      stopStreamingSimulation(true);
    }

    const bbCode = bbInput.value.trim();
    if (!bbCode) return;

    try {
      simulator.spec = TuringMachineSimulator.parseBBChallenge(bbCode);
    } catch (e) {
      alert(`Invalid bbchallenge string: ${e.message}`);
      return;
    }

    const rawVal = String(maxStepsInput.value || '').replace(/,/g, '').trim();
    const parsedLimit = parseInt(rawVal, 10);
    const maxSteps = Math.max(1, isNaN(parsedLimit) ? 500 : parsedLimit);

    const headOffset = parseInt(headPosInput.value, 10) || 0;
    const startTape = startTapeInput.value;
    const startState = startStateSelect.value || 'A';

    simulator.setInitialTape(startTape, headOffset, startState);
    simulator.initRun(maxSteps);

    // Update UI for streaming state
    isStreaming = true;
    btnRun.innerHTML = '<span class="btn-icon">⏹</span> Stop Simulation';
    btnRun.classList.remove('btn-primary');
    btnRun.classList.add('btn-danger');

    statStatus.textContent = 'Streaming...';
    statStatus.className = 'badge badge-running';

    const startTime = performance.now();
    let lastDrawTime = 0;
    const FRAME_BUDGET_MS = 14; // Yield to browser every 14ms for smooth 60fps

    function streamTick() {
      if (!isStreaming) return;

      const frameStart = performance.now();
      let done = false;

      // Execute simulation steps within frame budget
      while (performance.now() - frameStart < FRAME_BUDGET_MS) {
        const res = simulator.stepChunk(50000);
        if (res.done) {
          done = true;
          break;
        }
      }

      const now = performance.now();
      const currentStep = simulator._runContext ? simulator._runContext.step : 0;

      // Throttle visual diagram updates to ~10-15 fps so rendering does not slow down engine
      if (now - lastDrawTime > 90 || done) {
        lastDrawTime = now;
        const elapsedSec = (now - startTime) / 1000;
        const rate = elapsedSec > 0 ? (currentStep / elapsedSec) : 0;

        statSteps.textContent = `${currentStep.toLocaleString()} / ${maxSteps.toLocaleString()}`;
        statSpeed.textContent = `${(rate / 1e6).toFixed(2)} M/s`;
        statTime.textContent = `${(now - startTime).toFixed(1)} ms`;
        statSpan.textContent = `[${simulator.history.minHeadPos}, ${simulator.history.maxHeadPos}]`;

        // Live stream diagram update
        renderer.framingMode = framingSelect ? framingSelect.value : 'nonzeros';
        renderer.padToLimit = togglePadLimit ? togglePadLimit.checked : false;
        renderer.buildDiagram(simulator);
        renderer.render();

        exploreSlider.max = Math.max(1, currentStep);
      }

      if (done) {
        stopStreamingSimulation(false);
      } else {
        streamAnimationId = requestAnimationFrame(streamTick);
      }
    }

    streamAnimationId = requestAnimationFrame(streamTick);
  }

  function stopStreamingSimulation(wasCancelled = false) {
    if (streamAnimationId) {
      cancelAnimationFrame(streamAnimationId);
      streamAnimationId = null;
    }
    isStreaming = false;

    // Restore Run button
    btnRun.innerHTML = '<span class="btn-icon">⚡</span> Run Simulation';
    btnRun.classList.remove('btn-danger');
    btnRun.classList.add('btn-primary');

    const stats = simulator.finishRun();
    const maxSteps = stats.maxStepsLimit || stats.totalSteps;

    // Final Stats Display
    if (stats.halted) {
      statSteps.textContent = `${stats.totalSteps.toLocaleString()} (halted)`;
      statStatus.textContent = `Halted at step ${stats.totalSteps.toLocaleString()}`;
      statStatus.title = `Halted at step ${stats.totalSteps} (step limit was ${maxSteps.toLocaleString()})`;
    } else if (wasCancelled) {
      statSteps.textContent = `${stats.totalSteps.toLocaleString()} / ${maxSteps.toLocaleString()}`;
      statStatus.textContent = 'Stopped by user';
    } else {
      statSteps.textContent = `${stats.totalSteps.toLocaleString()} / ${maxSteps.toLocaleString()}`;
      statStatus.textContent = 'Step Limit Reached';
      statStatus.title = `Reached step limit of ${maxSteps.toLocaleString()}`;
    }

    statStatus.className = stats.halted ? 'badge badge-halted' : 'badge badge-running';
    statNonzeros.textContent = stats.finalNonZeros.toLocaleString();
    statSpan.textContent = `[${stats.minX}, ${stats.maxX}] (${stats.maxX - stats.minX + 1} cells)`;
    statTime.textContent = `${stats.elapsedMs.toFixed(2)} ms`;
    statSpeed.textContent = `${(stats.stepsPerSec / 1e6).toFixed(2)} M/s`;

    // Final high-res 512x768 render
    renderer.framingMode = framingSelect ? framingSelect.value : 'nonzeros';
    renderer.padToLimit = togglePadLimit ? togglePadLimit.checked : false;
    renderer.buildDiagram(simulator);
    renderer.fitView('fit');

    // Setup Explore Slider
    exploreSlider.max = Math.max(1, stats.totalSteps);
    currentStep = Math.min(currentStep, stats.totalSteps);
    exploreSlider.value = currentStep;
    updateExploreView(currentStep);
  }

  function runSimulation() {
    startStreamingSimulation();
  }

  // Explore Mode Toggle
  btnExplore.addEventListener('click', () => {
    isExploreMode = !isExploreMode;
    if (isExploreMode) {
      btnExplore.classList.add('active');
      explorePanel.classList.remove('hidden');
      updateExploreView(currentStep);
    } else {
      btnExplore.classList.remove('active');
      explorePanel.classList.add('hidden');
      renderer.exploreStep = null;
      renderer.render();
      stopPlayback();
    }
  });

  // Update Explore View & Tape Ribbon
  function updateExploreView(step) {
    if (!simulator || !simulator.history) return;
    const total = simulator.history.totalSteps;
    step = Math.max(0, Math.min(step, total));
    currentStep = step;

    exploreSlider.value = step;
    exploreStepDisplay.textContent = `${step} / ${total}`;

    // Update diagram marker
    renderer.exploreStep = step;
    renderer.render();

    // Query simulator tape state at step
    const info = simulator.getTapeAtStep(step);
    if (!info) return;

    exploreHeadPos.textContent = info.headPos;
    exploreState.textContent = info.stateName;
    exploreSymbol.textContent = info.symUnderHead;
    exploreNonzeros.textContent = info.nonZeroCount;
    exploreSpan.textContent = `[${info.minX}, ${info.maxX}]`;

    if (info.isHalted) {
      exploreRule.textContent = 'HALTED';
      exploreRule.className = 'stat-value badge-halted';
    } else if (info.nextAction) {
      exploreRule.textContent = `${info.stateName}(${info.symUnderHead}) -> ${info.nextAction.ruleString}`;
      exploreRule.className = 'stat-value';
    } else {
      exploreRule.textContent = 'None';
      exploreRule.className = 'stat-value';
    }

    renderTapeRibbon(info);
  }

  // Render Visual 1D Tape Ribbon
  function renderTapeRibbon(info) {
    tapeRibbon.innerHTML = '';
    const center = info.headPos;
    const windowRadius = 15; // Show cells from center - 15 to center + 15
    const theme = renderer.themes[renderer.currentTheme] || renderer.themes.monochrome;
    const numSymbols = simulator.spec.numSymbols;
    const maxSym = Math.max(1, numSymbols - 1);

    for (let pos = center - windowRadius; pos <= center + windowRadius; pos++) {
      const sym = info.tapeMap.get(pos) || 0;
      const isHead = pos === center;

      const cellDiv = document.createElement('div');
      cellDiv.className = `ribbon-cell ${isHead ? 'is-head' : ''}`;

      // Colored symbol square
      const rgb = theme.palette(sym, maxSym);
      cellDiv.style.backgroundColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
      // High contrast text color
      const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
      cellDiv.style.color = brightness > 125 ? '#000000' : '#ffffff';

      const valSpan = document.createElement('span');
      valSpan.className = 'ribbon-val';
      valSpan.textContent = sym;
      cellDiv.appendChild(valSpan);

      const posSpan = document.createElement('span');
      posSpan.className = 'ribbon-pos';
      posSpan.textContent = pos;
      cellDiv.appendChild(posSpan);

      if (isHead) {
        const headMarker = document.createElement('div');
        headMarker.className = 'head-pointer';
        headMarker.textContent = `▲ [${info.stateName}]`;
        cellDiv.appendChild(headMarker);
      }

      tapeRibbon.appendChild(cellDiv);
    }
  }

  // Playback Logic
  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback() {
    if (!simulator || !simulator.history) return;
    if (currentStep >= simulator.history.totalSteps) currentStep = 0;
    isPlaying = true;
    btnPlay.textContent = '⏸ Pause';
    btnPlay.classList.add('playing');

    const speed = parseInt(playSpeedSelect.value, 10) || 10;
    const intervalMs = Math.max(16, Math.floor(1000 / speed));
    const stepIncrement = Math.max(1, Math.floor(speed / 60));

    playInterval = setInterval(() => {
      if (currentStep >= simulator.history.totalSteps) {
        stopPlayback();
        return;
      }
      currentStep = Math.min(currentStep + stepIncrement, simulator.history.totalSteps);
      updateExploreView(currentStep);
    }, intervalMs);
  }

  function stopPlayback() {
    isPlaying = false;
    btnPlay.textContent = '▶ Play';
    btnPlay.classList.remove('playing');
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
  }

  // Slider & Playback Event Listeners
  exploreSlider.addEventListener('input', (e) => {
    updateExploreView(parseInt(e.target.value, 10));
  });

  btnPlay.addEventListener('click', togglePlayback);
  playSpeedSelect.addEventListener('change', () => {
    if (isPlaying) {
      stopPlayback();
      startPlayback();
    }
  });

  btnStepBack.addEventListener('click', () => {
    stopPlayback();
    updateExploreView(currentStep - 1);
  });

  btnStepFwd.addEventListener('click', () => {
    stopPlayback();
    updateExploreView(currentStep + 1);
  });

  btnJumpStart.addEventListener('click', () => {
    stopPlayback();
    updateExploreView(0);
  });

  btnJumpEnd.addEventListener('click', () => {
    stopPlayback();
    if (simulator && simulator.history) {
      updateExploreView(simulator.history.totalSteps);
    }
  });

  // Spacetime Diagram Click in Explore Mode
  renderer.onStepSelect = (step) => {
    if (!isExploreMode) {
      btnExplore.click();
    }
    updateExploreView(step);
  };

  // Keyboard Navigation
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayback();
    } else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
      e.preventDefault();
      updateExploreView(currentStep + 1);
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
      e.preventDefault();
      updateExploreView(currentStep - 1);
    }
  });

  // UI Event Handlers
  btnRun.addEventListener('click', toggleSimulation);

  presetSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      loadPreset(e.target.value);
      runSimulation();
    }
  });

  themeSelect.addEventListener('change', (e) => {
    renderer.setTheme(e.target.value);
    document.body.setAttribute('data-theme', e.target.value);
    if (isExploreMode) updateExploreView(currentStep);
  });

  bbInput.addEventListener('input', () => {
    try {
      const spec = TuringMachineSimulator.parseBBChallenge(bbInput.value.trim());
      simulator.spec = spec;
      updateStartStateDropdown(spec.numStates);
      renderTableFromSpec(spec);
    } catch (e) {
      // Ignored while typing
    }
  });

  toggleTrajectory.addEventListener('change', (e) => {
    renderer.showTrajectory = e.target.checked;
    renderer.render();
  });

  if (framingSelect) {
    framingSelect.addEventListener('change', (e) => {
      renderer.framingMode = e.target.value;
      if (simulator && simulator.history) {
        renderer.buildDiagram(simulator);
        renderer.render();
      }
    });
  }

  if (togglePadLimit) {
    togglePadLimit.addEventListener('change', (e) => {
      renderer.padToLimit = e.target.checked;
      if (simulator && simulator.history) {
        renderer.buildDiagram(simulator);
        renderer.render();
      }
    });
  }

  // Step limit input listeners (Enter key & change event)
  maxStepsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSimulation();
    }
  });

  maxStepsInput.addEventListener('change', () => {
    runSimulation();
  });

  // Step limit quick pill buttons
  document.querySelectorAll('.step-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const steps = e.target.getAttribute('data-steps');
      if (steps) {
        maxStepsInput.value = steps;
        runSimulation();
      }
    });
  });

  btnFit.addEventListener('click', () => renderer.fitView('fit'));
  if (btnActual) btnActual.addEventListener('click', () => renderer.fitView('actual'));
  btnExport.addEventListener('click', () => renderer.exportPNG());

  // Tape Quick Fill Buttons
  tapeQuickBlank.addEventListener('click', () => {
    startTapeInput.value = '0';
    headPosInput.value = '0';
  });

  tapeQuickUnary.addEventListener('click', () => {
    startTapeInput.value = '11111';
    headPosInput.value = '0';
  });

  tapeQuickBinary.addEventListener('click', () => {
    startTapeInput.value = '101010'; // 42 in binary
    headPosInput.value = '0';
  });

  tapeQuickAlternating.addEventListener('click', () => {
    startTapeInput.value = '10101010';
    headPosInput.value = '0';
  });

  tapeQuickRandom.addEventListener('click', () => {
    let s = '';
    const numSyms = simulator.spec.numSymbols;
    for (let i = 0; i < 20; i++) {
      s += Math.floor(Math.random() * numSyms);
    }
    startTapeInput.value = s;
    headPosInput.value = '10';
  });

  // Tab switching (bbchallenge string vs table)
  const tabBtnString = document.getElementById('tab-btn-string');
  const tabBtnTable = document.getElementById('tab-btn-table');
  const tabPaneString = document.getElementById('tab-pane-string');
  const tabPaneTable = document.getElementById('tab-pane-table');

  tabBtnString.addEventListener('click', () => {
    tabBtnString.classList.add('active');
    tabBtnTable.classList.remove('active');
    tabPaneString.classList.remove('hidden');
    tabPaneTable.classList.add('hidden');
  });

  tabBtnTable.addEventListener('click', () => {
    tabBtnTable.classList.add('active');
    tabBtnString.classList.remove('active');
    tabPaneTable.classList.remove('hidden');
    tabPaneString.classList.add('hidden');
  });

  // Initialize
  init();
});
