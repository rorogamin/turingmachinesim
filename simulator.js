/**
 * Turing Machine Engine & bbchallenge Parser
 * Ultra-fast Turing Machine simulation engine using typed arrays.
 * Capable of >100,000,000 steps/sec.
 * Supports synchronous runs and streaming chunked execution for zero UI lag.
 */

class TuringMachineSimulator {
  constructor(spec = null) {
    this.spec = spec || TuringMachineSimulator.parseBBChallenge('1RB1LB_1LA1RZ');
    this.initialTapeString = '0';
    this.initialHeadPos = 0;
    this.initialState = 'A';

    // Simulation results & history
    this.history = null;
    this.stats = {
      totalSteps: 0,
      maxStepsLimit: 0,
      halted: false,
      haltReason: null,
      minX: 0,
      maxX: 0,
      minNonZeroX: 0,
      maxNonZeroX: 0,
      finalNonZeros: 0,
      elapsedMs: 0,
      stepsPerSec: 0,
    };

    // Streaming state
    this._runContext = null;
  }

  /**
   * Parse bbchallenge standard format string:
   * e.g. "1RB1LB_1LA1RZ"
   * States separated by "_".
   * Each transition is 3 chars: [write][dir][state] (e.g. "1RB", "0LA", "---")
   * Next state 'Z', 'H', or '-' represents HALT.
   */
  static parseBBChallenge(str) {
    if (!str || typeof str !== 'string') {
      throw new Error('Invalid bbchallenge format: input must be a non-empty string');
    }

    const clean = str.trim().replace(/\s+/g, '');
    const stateBlocks = clean.split('_');
    const numStates = stateBlocks.length;
    if (numStates === 0) throw new Error('No states defined');

    const stateNames = [];
    for (let s = 0; s < numStates; s++) {
      stateNames.push(String.fromCharCode(65 + s)); // A, B, C...
    }

    // Determine number of symbols
    const rawTransitions = [];
    let numSymbols = 0;
    for (let s = 0; s < numStates; s++) {
      const block = stateBlocks[s];
      const trans = [];
      for (let i = 0; i < block.length; i += 3) {
        trans.push(block.slice(i, i + 3));
      }
      rawTransitions.push(trans);
      if (trans.length > numSymbols) numSymbols = trans.length;
    }

    if (numSymbols === 0) numSymbols = 2; // Default 2 symbols (0, 1)

    // Build structured table and flat fast arrays
    const table = {};
    const writeArray = new Uint8Array(numStates * numSymbols);
    const dirArray = new Int8Array(numStates * numSymbols);
    const nextStateArray = new Int16Array(numStates * numSymbols);
    const isHaltArray = new Uint8Array(numStates * numSymbols);
    const isUndefinedArray = new Uint8Array(numStates * numSymbols);

    for (let s = 0; s < numStates; s++) {
      const sName = stateNames[s];
      table[sName] = [];
      const transList = rawTransitions[s];

      for (let c = 0; c < numSymbols; c++) {
        const idx = s * numSymbols + c;
        if (c >= transList.length) {
          // Missing transition treated as undefined halt
          writeArray[idx] = 0;
          dirArray[idx] = 1;
          nextStateArray[idx] = -1;
          isHaltArray[idx] = 1;
          isUndefinedArray[idx] = 1;
          table[sName].push({ write: 0, dir: 'R', nextState: 'Z', isHalt: true, isUndefined: true });
          continue;
        }

        const t = transList[c];
        if (t === '---' || t === '...') {
          writeArray[idx] = 0;
          dirArray[idx] = 1;
          nextStateArray[idx] = -1;
          isHaltArray[idx] = 1;
          isUndefinedArray[idx] = 1;
          table[sName].push({ write: 0, dir: 'R', nextState: 'Z', isHalt: true, isUndefined: true });
        } else {
          const w = parseInt(t[0], 10);
          const dChar = (t[1] || 'R').toUpperCase();
          const d = dChar === 'L' ? -1 : 1;
          const nsChar = (t[2] || 'Z').toUpperCase();

          let ns = -1;
          let isHalt = false;
          if (nsChar === 'Z' || nsChar === 'H' || nsChar === '-') {
            ns = -1;
            isHalt = true;
          } else {
            ns = nsChar.charCodeAt(0) - 65;
            if (ns < 0 || ns >= numStates) {
              ns = -1;
              isHalt = true;
            }
          }

          const writeVal = isNaN(w) ? 0 : w;
          writeArray[idx] = writeVal;
          dirArray[idx] = d;
          nextStateArray[idx] = ns;
          isHaltArray[idx] = isHalt ? 1 : 0;
          isUndefinedArray[idx] = 0;

          table[sName].push({
            write: writeVal,
            dir: dChar === 'L' ? 'L' : 'R',
            nextState: isHalt ? 'Z' : String.fromCharCode(65 + ns),
            isHalt,
            isUndefined: false,
          });
        }
      }
    }

    return {
      bbString: clean,
      numStates,
      numSymbols,
      stateNames,
      table,
      writeArray,
      dirArray,
      nextStateArray,
      isHaltArray,
      isUndefinedArray,
    };
  }

  /**
   * Convert matrix table structure to bbchallenge standard string
   */
  static tableToBBChallenge(table, numStates, numSymbols) {
    const blocks = [];
    for (let s = 0; s < numStates; s++) {
      const sName = String.fromCharCode(65 + s);
      const row = table[sName] || [];
      let block = '';
      for (let c = 0; c < numSymbols; c++) {
        const cell = row[c];
        if (!cell || cell.isUndefined) {
          block += '---';
        } else {
          const w = cell.write !== undefined ? cell.write : 0;
          const d = (cell.dir || 'R').toUpperCase() === 'L' ? 'L' : 'R';
          let ns = (cell.nextState || 'Z').toUpperCase();
          if (ns !== 'Z' && ns !== 'H' && ns.charCodeAt(0) >= 65 && ns.charCodeAt(0) < 65 + numStates) {
            // Valid state
          } else {
            ns = 'Z';
          }
          block += `${w}${d}${ns}`;
        }
      }
      blocks.push(block);
    }
    return blocks.join('_');
  }

  /**
   * Set custom initial tape
   */
  setInitialTape(pattern, headOffset = 0, startingState = 'A') {
    this.initialTapeString = pattern || '0';
    this.initialHeadPos = parseInt(headOffset, 10) || 0;
    this.initialState = (startingState || 'A').toUpperCase();
  }

  /**
   * Parse initial tape string into list of { pos, symbol }
   */
  getInitialTapeCells() {
    const str = (this.initialTapeString || '0').trim();
    const cells = [];
    const tokens = str.includes(' ') || str.includes(',')
      ? str.split(/[\s,]+/).filter(Boolean)
      : str.split('');

    for (let i = 0; i < tokens.length; i++) {
      const sym = parseInt(tokens[i], 10);
      if (!isNaN(sym)) {
        cells.push({ pos: i, symbol: sym });
      }
    }
    return cells;
  }

  /**
   * Initialize a simulation run (for streaming or synchronous execution).
   */
  initRun(maxSteps = 50000) {
    const startTime = performance.now();
    const spec = this.spec;
    const { numStates, numSymbols, writeArray, dirArray, nextStateArray, isHaltArray, isUndefinedArray } = spec;

    let state = this.initialState.charCodeAt(0) - 65;
    if (state < 0 || state >= numStates) state = 0;

    let tapeCapacity = 131072;
    let tape = new Uint8Array(tapeCapacity);
    let tapeOrigin = tapeCapacity >> 1;

    const initialCells = this.getInitialTapeCells();
    for (const cell of initialCells) {
      const idx = tapeOrigin + cell.pos;
      if (idx >= 0 && idx < tapeCapacity) {
        tape[idx] = cell.symbol;
      }
    }

    let head = tapeOrigin + this.initialHeadPos;
    let minHeadPos = this.initialHeadPos;
    let maxHeadPos = this.initialHeadPos;

    for (const cell of initialCells) {
      if (cell.symbol > 0) {
        if (cell.pos < minHeadPos) minHeadPos = cell.pos;
        if (cell.pos > maxHeadPos) maxHeadPos = cell.pos;
      }
    }

    // Allocate history arrays (supports up to 50M steps for full BB5 verification)
    const historyCap = Math.min(maxSteps, 50000000);
    const headHistory = new Int32Array(historyCap + 1);
    const stateHistory = new Uint8Array(historyCap + 1);
    const writeHistory = new Uint8Array(historyCap);
    const prevSymHistory = new Uint8Array(historyCap);

    headHistory[0] = this.initialHeadPos;
    stateHistory[0] = state;

    const CHECKPOINT_INTERVAL = 10000;
    const checkpoints = new Map();
    const saveCheckpoint = (s) => {
      const ctx = this._runContext;
      if (!ctx) return;
      const snap = new Map();
      const tape = ctx.tape;
      const origin = ctx.tapeOrigin;
      const cap = ctx.tapeCapacity;
      const left = origin + ctx.minHeadPos - 5;
      const right = origin + ctx.maxHeadPos + 5;
      const start = Math.max(0, left);
      const end = Math.min(cap, right);
      for (let i = start; i < end; i++) {
        if (tape[i] > 0) snap.set(i - origin, tape[i]);
      }
      checkpoints.set(s, { tapeSnap: snap, head: ctx.head - origin, state: ctx.state });
    };

    // Precompute 768 row steps and snapshot buffer for streaming spacetime diagram
    const TARGET_ROWS = 768;
    const numRows = Math.min(maxSteps + 1, TARGET_ROWS);
    const rowSteps = new Int32Array(numRows);
    for (let y = 0; y < numRows; y++) {
      rowSteps[y] = Math.min(maxSteps, Math.floor((y / Math.max(1, numRows - 1)) * maxSteps));
    }
    const rowSnapshots = new Array(numRows);

    const captureRowSnapshot = () => {
      const ctx = this._runContext;
      if (!ctx) return;
      while (ctx.nextSnapshotRow < ctx.numRows && ctx.step >= ctx.rowSteps[ctx.nextSnapshotRow]) {
        const origin = ctx.tapeOrigin;
        const minP = ctx.minHeadPos;
        const maxP = ctx.maxHeadPos;
        const len = Math.max(1, maxP - minP + 1);
        const slice = new Uint8Array(len);
        const start = origin + minP;
        for (let i = 0; i < len; i++) {
          const idx = start + i;
          if (idx >= 0 && idx < ctx.tapeCapacity) slice[i] = ctx.tape[idx];
        }
        ctx.rowSnapshots[ctx.nextSnapshotRow] = { minP, maxP, slice };
        ctx.nextSnapshotRow++;
      }
    };

    this._runContext = {
      spec,
      numStates,
      numSymbols,
      writeArray,
      dirArray,
      nextStateArray,
      isHaltArray,
      isUndefinedArray,
      tapeCapacity,
      tape,
      tapeOrigin,
      head,
      state,
      minHeadPos,
      maxHeadPos,
      step: 0,
      maxSteps,
      historyCap,
      headHistory,
      stateHistory,
      writeHistory,
      prevSymHistory,
      CHECKPOINT_INTERVAL,
      checkpoints,
      saveCheckpoint,
      TARGET_ROWS,
      numRows,
      rowSteps,
      rowSnapshots,
      nextSnapshotRow: 0,
      captureRowSnapshot,
      startTime,
      halted: false,
      haltReason: null,
      initialCells,
    };
    saveCheckpoint(0);
    captureRowSnapshot();

    this.history = {
      maxSteps,
      totalSteps: 0,
      headHistory,
      stateHistory,
      writeHistory,
      prevSymHistory,
      minHeadPos,
      maxHeadPos,
      minNonZeroX: minHeadPos,
      maxNonZeroX: maxHeadPos,
      checkpoints,
      CHECKPOINT_INTERVAL,
      initialCells,
      rowSnapshots,
      rowSteps,
      nextSnapshotRow: 0,
      numRows,
    };

    this.stats = {
      totalSteps: 0,
      maxStepsLimit: maxSteps,
      halted: false,
      haltReason: null,
      minX: minHeadPos,
      maxX: maxHeadPos,
      minNonZeroX: minHeadPos,
      maxNonZeroX: maxHeadPos,
      finalNonZeros: 0,
      elapsedMs: 0,
      stepsPerSec: 0,
    };

    return this._runContext;
  }

  /**
   * Execute a batch/chunk of simulation steps.
   * Yields control back to the caller for streaming.
   */
  stepChunk(chunkSize = 50000) {
    const ctx = this._runContext;
    if (!ctx || ctx.halted || ctx.step >= ctx.maxSteps) {
      return { done: true, totalSteps: ctx ? ctx.step : 0, stepsInChunk: 0, halted: ctx ? ctx.halted : false };
    }

    const {
      numSymbols, writeArray, dirArray, nextStateArray, isHaltArray, isUndefinedArray,
      maxSteps, historyCap, headHistory, stateHistory, writeHistory, prevSymHistory,
      CHECKPOINT_INTERVAL, saveCheckpoint
    } = ctx;

    let { tapeCapacity, tape, tapeOrigin, head, state, minHeadPos, maxHeadPos, step } = ctx;

    const targetStep = Math.min(step + chunkSize, maxSteps);
    const startStep = step;

    while (step < targetStep) {
      // Dynamic tape expansion if head nears buffer edges
      if (head < 512 || head > tapeCapacity - 512) {
        const newCap = tapeCapacity * 2;
        const newTape = new Uint8Array(newCap);
        const shift = (newCap >> 1) - tapeOrigin;
        newTape.set(tape, shift);
        tape = newTape;
        tapeOrigin += shift;
        head += shift;
        tapeCapacity = newCap;
        ctx.tape = tape;
        ctx.tapeOrigin = tapeOrigin;
        ctx.tapeCapacity = newCap;
      }

      const sym = tape[head];
      const lookupIdx = state * numSymbols + sym;

      if (isUndefinedArray[lookupIdx]) {
        ctx.halted = true;
        ctx.haltReason = 'undefined_transition';
        break;
      }

      const w = writeArray[lookupIdx];
      const d = dirArray[lookupIdx];
      const ns = nextStateArray[lookupIdx];
      const isHalt = isHaltArray[lookupIdx];

      if (step < historyCap) {
        writeHistory[step] = w;
        prevSymHistory[step] = sym;
      }

      tape[head] = w;
      head += d;
      const currPos = head - tapeOrigin;
      if (currPos < minHeadPos) minHeadPos = currPos;
      if (currPos > maxHeadPos) maxHeadPos = currPos;

      step++;
      if (step <= historyCap) {
        headHistory[step] = currPos;
      }

      if (isHalt || ns === -1) {
        if (step <= historyCap) stateHistory[step] = 255;
        ctx.halted = true;
        ctx.haltReason = 'halt_transition';
        break;
      }

      state = ns;
      if (step <= historyCap) {
        stateHistory[step] = state;
      }

      if (step % CHECKPOINT_INTERVAL === 0) {
        ctx.head = head;
        ctx.state = state;
        ctx.minHeadPos = minHeadPos;
        ctx.maxHeadPos = maxHeadPos;
        saveCheckpoint(step);
      }
    }

    if (!ctx.halted && step >= maxSteps) {
      ctx.haltReason = 'step_limit';
    }

    ctx.head = head;
    ctx.state = state;
    ctx.minHeadPos = minHeadPos;
    ctx.maxHeadPos = maxHeadPos;
    ctx.step = step;

    if (ctx.captureRowSnapshot) {
      ctx.captureRowSnapshot();
      this.history.nextSnapshotRow = ctx.nextSnapshotRow;
    }

    // Update history wrapper
    this.history.totalSteps = step;
    this.history.minHeadPos = minHeadPos;
    this.history.maxHeadPos = maxHeadPos;

    const stepsInChunk = step - startStep;
    const done = ctx.halted || step >= maxSteps;

    return {
      done,
      stepsInChunk,
      totalSteps: step,
      halted: ctx.halted,
      haltReason: ctx.haltReason,
    };
  }

  /**
   * Finalize the simulation run and compute statistics.
   */
  finishRun() {
    const ctx = this._runContext;
    if (!ctx) return this.stats;

    const { tape, tapeOrigin, minHeadPos, maxHeadPos, step, maxSteps, tapeCapacity, startTime, halted, haltReason, historyCap, headHistory, stateHistory, writeHistory, prevSymHistory } = ctx;

    // Count non-zeros on final tape and determine non-zero bounds
    let nonZeros = 0;
    let minNonZero = Infinity;
    let maxNonZero = -Infinity;
    const countStart = Math.max(0, tapeOrigin + minHeadPos - 5);
    const countEnd = Math.min(tapeCapacity, tapeOrigin + maxHeadPos + 6);
    for (let i = countStart; i < countEnd; i++) {
      if (tape[i] > 0) {
        nonZeros++;
        const pos = i - tapeOrigin;
        if (pos < minNonZero) minNonZero = pos;
        if (pos > maxNonZero) maxNonZero = pos;
      }
    }

    if (minNonZero === Infinity) {
      minNonZero = minHeadPos;
      maxNonZero = maxHeadPos;
    }

    const elapsedMs = performance.now() - startTime;
    const stepsPerSec = elapsedMs > 0 ? (step / (elapsedMs / 1000)) : 0;

    const historySteps = Math.min(step, historyCap);
    this.history.totalSteps = step;
    this.history.minHeadPos = minHeadPos;
    this.history.maxHeadPos = maxHeadPos;
    this.history.minNonZeroX = minNonZero;
    this.history.maxNonZeroX = maxNonZero;
    this.history.headHistory = headHistory.subarray(0, historySteps + 1);
    this.history.stateHistory = stateHistory.subarray(0, historySteps + 1);
    this.history.writeHistory = writeHistory.subarray(0, historySteps);
    this.history.prevSymHistory = prevSymHistory.subarray(0, historySteps);

    if (ctx && ctx.captureRowSnapshot) {
      ctx.captureRowSnapshot();
      while (ctx.nextSnapshotRow < ctx.numRows) {
        const origin = ctx.tapeOrigin;
        const minP = ctx.minHeadPos;
        const maxP = ctx.maxHeadPos;
        const len = Math.max(1, maxP - minP + 1);
        const slice = new Uint8Array(len);
        const start = origin + minP;
        for (let i = 0; i < len; i++) {
          const idx = start + i;
          if (idx >= 0 && idx < ctx.tapeCapacity) slice[i] = ctx.tape[idx];
        }
        ctx.rowSnapshots[ctx.nextSnapshotRow] = { minP, maxP, slice };
        ctx.nextSnapshotRow++;
      }
      this.history.nextSnapshotRow = ctx.nextSnapshotRow;
    }

    this.stats = {
      totalSteps: step,
      maxStepsLimit: maxSteps,
      halted,
      haltReason: halted ? haltReason : (step >= maxSteps ? 'step_limit' : 'stopped'),
      minX: minHeadPos,
      maxX: maxHeadPos,
      minNonZeroX: minNonZero,
      maxNonZeroX: maxNonZero,
      finalNonZeros: nonZeros,
      elapsedMs,
      stepsPerSec,
    };

    return this.stats;
  }

  /**
   * Synchronous execution wrapper.
   */
  run(maxSteps = 50000) {
    this.initRun(maxSteps);
    while (true) {
      const res = this.stepChunk(100000);
      if (res.done) break;
    }
    return this.finishRun();
  }

  /**
   * Reconstruct tape at exact time step `t`.
   * Fast O(1) stepping or O(checkpoint) jump.
   */
  getTapeAtStep(t) {
    if (!this.history || t < 0 || t > this.history.totalSteps) return null;
    const { totalSteps, headHistory, stateHistory, writeHistory, checkpoints, CHECKPOINT_INTERVAL, initialCells } = this.history;

    if (!headHistory || t >= headHistory.length) return null;

    const chkStep = Math.floor(t / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
    const chk = checkpoints.get(chkStep);

    const tapeMap = new Map();
    if (chk) {
      for (const [k, v] of chk.tapeSnap) {
        tapeMap.set(k, v);
      }
    } else {
      for (const cell of initialCells) {
        if (cell.symbol > 0) tapeMap.set(cell.pos, cell.symbol);
      }
    }

    const startStep = chk ? chkStep : 0;
    for (let s = startStep; s < t; s++) {
      if (s < writeHistory.length) {
        const h = headHistory[s];
        const w = writeHistory[s];
        if (w === 0) tapeMap.delete(h);
        else tapeMap.set(h, w);
      }
    }

    const headPos = headHistory[t];
    const stateIdx = stateHistory[t];
    const isHalted = stateIdx === 255 || t === totalSteps && this.stats.halted;
    const stateName = isHalted ? 'HALT (Z)' : String.fromCharCode(65 + stateIdx);
    const symUnderHead = tapeMap.get(headPos) || 0;

    let nextAction = null;
    if (!isHalted && this.spec.table[stateName]) {
      const rule = this.spec.table[stateName][symUnderHead];
      if (rule) {
        nextAction = {
          write: rule.write,
          dir: rule.dir,
          nextState: rule.nextState,
          isHalt: rule.isHalt,
          isUndefined: rule.isUndefined,
          ruleString: rule.isUndefined ? '--- (Undefined / Halt)' : `${rule.write}${rule.dir}${rule.nextState}`,
        };
      }
    }

    return {
      step: t,
      headPos,
      stateIdx,
      stateName,
      symUnderHead,
      isHalted,
      nextAction,
      tapeMap,
      minX: this.history.minHeadPos,
      maxX: this.history.maxHeadPos,
      nonZeroCount: tapeMap.size,
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TuringMachineSimulator };
}
