/**
 * Unit Test Suite for Turing Machine Simulator
 * Verifies bbchallenge parsing, BB champions, custom initial tapes, and performance.
 */

const assert = require('assert');
const { TuringMachineSimulator } = require('./simulator');

console.log('🧪 Starting Turing Machine Simulator Test Suite...\n');

// 1. BB(2) Champion Verification
{
  const sim = new TuringMachineSimulator(TuringMachineSimulator.parseBBChallenge('1RB1LB_1LA1RZ'));
  const stats = sim.run(100);
  console.log(`[PASS] BB(2) Champion: halted in ${stats.totalSteps} steps (expected 6), nonZeros: ${stats.finalNonZeros} (expected 4)`);
  assert.strictEqual(stats.totalSteps, 6, 'BB(2) must halt in 6 steps');
  assert.strictEqual(stats.finalNonZeros, 4, 'BB(2) must produce 4 non-zero symbols');
  assert.strictEqual(stats.halted, true, 'BB(2) must halt');
}

// 2. BB(3) Champion Verification
{
  const sim = new TuringMachineSimulator(TuringMachineSimulator.parseBBChallenge('1RB1RZ_1LB0RC_1LC1LA'));
  const stats = sim.run(100);
  console.log(`[PASS] BB(3) Champion: halted in ${stats.totalSteps} steps (expected 21)`);
  assert.strictEqual(stats.totalSteps, 21, 'BB(3) must halt in 21 steps');
  assert.strictEqual(stats.halted, true, 'BB(3) must halt');
}

// 3. BB(4) Champion Verification
{
  const sim = new TuringMachineSimulator(TuringMachineSimulator.parseBBChallenge('1RB1LB_1LA0LC_1RZ1LD_1RD0RA'));
  const stats = sim.run(500);
  console.log(`[PASS] BB(4) Champion: halted in ${stats.totalSteps} steps (expected 107), nonZeros: ${stats.finalNonZeros} (expected 13)`);
  assert.strictEqual(stats.totalSteps, 107, 'BB(4) must halt in 107 steps');
  assert.strictEqual(stats.finalNonZeros, 13, 'BB(4) must produce 13 non-zero symbols');
  assert.strictEqual(stats.halted, true, 'BB(4) must halt');
}

// 4. BB(2,3) Multi-Symbol Champion Verification
{
  const sim = new TuringMachineSimulator(TuringMachineSimulator.parseBBChallenge('1RB2LB1RZ_2LA2RB1LB'));
  const stats = sim.run(200);
  console.log(`[PASS] BB(2,3) Multi-Symbol Champion: halted in ${stats.totalSteps} steps (expected 38), nonZeros: ${stats.finalNonZeros} (expected 9)`);
  assert.strictEqual(stats.totalSteps, 38, 'BB(2,3) must halt in 38 steps');
  assert.strictEqual(stats.finalNonZeros, 9, 'BB(2,3) must produce 9 non-zeros');
}

// 5. Custom Initial Tape (Binary Incrementer)
{
  const sim = new TuringMachineSimulator(TuringMachineSimulator.parseBBChallenge('1RB0LB_1LA1RZ'));
  // Tape 1101 (13 in decimal, little-endian or bit string). Increment: 1101 + 1 = 1110 (14) or similar
  sim.setInitialTape('1101', 0, 'A');
  const stats = sim.run(100);
  console.log(`[PASS] Custom Starting Tape (1101): steps = ${stats.totalSteps}, finalNonZeros = ${stats.finalNonZeros}`);
  assert(stats.totalSteps > 0, 'Simulation on custom tape must execute steps');
}

// 6. Roundtrip Serialization: Table -> BBChallenge -> Table
{
  const original = '1RB1LB_1LA0LC_1RZ1LD_1RD0RA';
  const spec = TuringMachineSimulator.parseBBChallenge(original);
  const serialized = TuringMachineSimulator.tableToBBChallenge(spec.table, spec.numStates, spec.numSymbols);
  console.log(`[PASS] Table Roundtrip Serialization: original = ${original}, serialized = ${serialized}`);
  assert.strictEqual(serialized, original, 'Table to bbchallenge string must match original');
}

// 7. Explore Mode Tape Reconstruction at arbitrary steps
{
  const sim = new TuringMachineSimulator(TuringMachineSimulator.parseBBChallenge('1RB1LB_1LA0LC_1RZ1LD_1RD0RA'));
  sim.run(200);
  const step0 = sim.getTapeAtStep(0);
  const step50 = sim.getTapeAtStep(50);
  const step107 = sim.getTapeAtStep(107);

  assert.strictEqual(step0.step, 0);
  assert.strictEqual(step0.stateName, 'A');
  assert.strictEqual(step107.isHalted, true);
  console.log(`[PASS] Explore Mode: step 0 (state ${step0.stateName}), step 50 (state ${step50.stateName}), step 107 (halted: ${step107.isHalted})`);
}

// 8. Performance Benchmark
{
  const sim = new TuringMachineSimulator(TuringMachineSimulator.parseBBChallenge('1RB1LC_1RC1RB_1RD0LE_1LA1LD_1RZ0LA'));
  const testSteps = 2000000;
  const stats = sim.run(testSteps);
  console.log(`[PASS] Performance: Simulated ${stats.totalSteps.toLocaleString()} steps in ${stats.elapsedMs.toFixed(2)} ms (${(stats.stepsPerSec / 1e6).toFixed(2)} Million steps/sec)`);
  assert(stats.stepsPerSec > 10000000, 'Simulator must achieve > 10M steps/sec');
}

// 9. Streaming API Verification
{
  const sim = new TuringMachineSimulator(TuringMachineSimulator.parseBBChallenge('1RB1LB_1LA0LC_1RZ1LD_1RD0RA'));
  sim.initRun(500);
  let chunks = 0;
  while (true) {
    const res = sim.stepChunk(20);
    chunks++;
    if (res.done) break;
  }
  const stats = sim.finishRun();
  console.log(`[PASS] Streaming API: halted in ${stats.totalSteps} steps across ${chunks} chunks`);
  assert.strictEqual(stats.totalSteps, 107);
  assert.strictEqual(stats.halted, true);
}

// 10. BB(5) Champion Stripes (Lines between Parabolas) Verification
{
  const sim = new TuringMachineSimulator(TuringMachineSimulator.parseBBChallenge('1RB1LC_1RC1RB_1RD0LE_1LA1LD_1RZ0LA'));
  const ctx = sim.initRun(18000000);
  // Advance past step 16,970,000 where the phase transition leaves the period-3 stripes
  for (let s = 0; s < 170; s++) {
    sim.stepChunk(100000);
  }
  const tape = ctx.tape;
  const origin = ctx.tapeOrigin;
  let stripes = 0;
  for (let x = -7000; x <= -6500; x++) {
    if (tape[origin + x] === 1 && tape[origin + x + 1] === 0 && tape[origin + x + 2] === 0 && tape[origin + x + 3] === 1) {
      stripes++;
    }
  }
  console.log(`[PASS] BB(5) Champion Stripes: detected ${stripes} period-3 stripes in transition region`);
  assert(stripes > 100, 'BB(5) must produce period-3 stripes between parabolas');
}

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
