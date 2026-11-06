/**
 * Turing Machine Engine & bbchallenge Parser
 * Ultra-fast Turing Machine simulation engine using typed arrays.
 * Capable of >100,000,000 steps/sec.
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
      halted: false,
      haltReason: null,
      minX: 0,
      maxX: 0,
      finalNonZeros: 0,
      elapsedMs: 0,
      stepsPerSec: 0,
    };
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
    // Can be whitespace/comma separated or contiguous digits
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
   * Execute simulation up to maxSteps.
   * Uses high-speed typed arrays and records history for spacetime diagrams and exploration.
   */
  run(maxSteps = 50000) {
    const startTime = performance.now();
    const spec = this.spec;
    const { numStates, numSymbols, writeArray, dirArray, nextStateArray, isHaltArray, isUndefinedArray } = spec;

    // Start state
    let state = this.initialState.charCodeAt(0) - 65;
    if (state < 0 || state >= numStates) state = 0;

    // Fast expandable tape buffer
    let tapeCapacity = 131072;
    let tape = new Uint8Array(tapeCapacity);
    let tapeOrigin = tapeCapacity >> 1; // tape[origin] corresponds to x = 0

    // Load initial tape
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

    // If initial tape had non-zeros, expand bounds
    for (const cell of initialCells) {
      if (cell.symbol > 0) {
        if (cell.pos < minHeadPos) minHeadPos = cell.pos;
        if (cell.pos > maxHeadPos) maxHeadPos = cell.pos;
      }
    }

    // Allocate history arrays
    const headHistory = new Int32Array(maxSteps + 1);
    const stateHistory = new Uint8Array(maxSteps + 1);
    const writeHistory = new Uint8Array(maxSteps);
    const prevSymHistory = new Uint8Array(maxSteps);

    // Initial state at t = 0
    headHistory[0] = this.initialHeadPos;
    stateHistory[0] = state;

    // Checkpoint management for fast explore mode:
    // Every CHECKPOINT_INTERVAL steps, save a snapshot of non-zero tape
    const CHECKPOINT_INTERVAL = 10000;
    const checkpoints = new Map();
    const saveCheckpoint = (step) => {
      const snap = new Map();
      const left = tapeOrigin + minHeadPos - 5;
      const right = tapeOrigin + maxHeadPos + 5;
      const start = Math.max(0, left);
      const end = Math.min(tapeCapacity, right);
      for (let i = start; i < end; i++) {
        if (tape[i] > 0) snap.set(i - tapeOrigin, tape[i]);
      }
      checkpoints.set(step, { tapeSnap: snap, head: head - tapeOrigin, state });
    };
    saveCheckpoint(0);

    let step = 0;
    let halted = false;
    let haltReason = null;

    // Tight inner simulation loop
    while (step < maxSteps) {
      // Dynamic tape expansion if head nears buffer edges (rare)
      if (head < 512 || head > tapeCapacity - 512) {
        const newCap = tapeCapacity * 2;
        const newTape = new Uint8Array(newCap);
        const shift = (newCap >> 1) - tapeOrigin;
        newTape.set(tape, shift);
        tape = newTape;
        tapeOrigin += shift;
        head += shift;
        tapeCapacity = newCap;
      }

      const sym = tape[head];
      const lookupIdx = state * numSymbols + sym;

      if (isUndefinedArray[lookupIdx]) {
        halted = true;
        haltReason = 'undefined_transition';
        break;
      }

      const w = writeArray[lookupIdx];
      const d = dirArray[lookupIdx];
      const ns = nextStateArray[lookupIdx];
      const isHalt = isHaltArray[lookupIdx];

      // Record history
      writeHistory[step] = w;
      prevSymHistory[step] = sym;

      // Apply write & move
      tape[head] = w;
      head += d;
      const currPos = head - tapeOrigin;
      if (currPos < minHeadPos) minHeadPos = currPos;
      if (currPos > maxHeadPos) maxHeadPos = currPos;

      step++;
      headHistory[step] = currPos;

      if (isHalt || ns === -1) {
        stateHistory[step] = 255; // Halt marker
        halted = true;
        haltReason = 'halt_transition';
        break;
      }

      state = ns;
      stateHistory[step] = state;

      if (step % CHECKPOINT_INTERVAL === 0) {
        saveCheckpoint(step);
      }
    }

    if (!halted && step >= maxSteps) {
      haltReason = 'step_limit';
    }

    // Count non-zero symbols on final tape and determine non-zero bounds
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

    this.history = {
      maxSteps,
      totalSteps: step,
      headHistory: headHistory.subarray(0, step + 1),
      stateHistory: stateHistory.subarray(0, step + 1),
      writeHistory: writeHistory.subarray(0, step),
      prevSymHistory: prevSymHistory.subarray(0, step),
      minHeadPos,
      maxHeadPos,
      minNonZeroX: minNonZero,
      maxNonZeroX: maxNonZero,
      checkpoints,
      CHECKPOINT_INTERVAL,
      initialCells,
    };

    this.stats = {
      totalSteps: step,
      halted,
      haltReason,
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
   * Reconstruct tape at exact time step `t`.
   * Fast O(1) stepping or O(checkpoint) jump.
   */
  getTapeAtStep(t) {
    if (!this.history || t < 0 || t > this.history.totalSteps) return null;
    const { totalSteps, headHistory, stateHistory, writeHistory, prevSymHistory, checkpoints, CHECKPOINT_INTERVAL, initialCells } = this.history;

    // Find nearest checkpoint at or before t
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

    // Roll forward from checkpoint to t
    const startStep = chk ? chkStep : 0;
    for (let s = startStep; s < t; s++) {
      const h = headHistory[s];
      const w = writeHistory[s];
      if (w === 0) tapeMap.delete(h);
      else tapeMap.set(h, w);
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
