# turingmachinesim

An ultra-fast Turing Machine Simulator featuring **Space-Time Diagrams**, standard **bbchallenge** format support, interactive **Transition Table editing**, custom starting tapes, multiple visual themes, and a deep-dive **Explore Mode** with step-by-step tape inspection.

Simulates at **over 30,000,000 to 150,000,000 steps per second** using high-speed typed arrays and optimized row memory transfers.

---

## 🚀 Features

- **Blazing Fast Simulation Engine**:
  - Pure typed-array architecture (`Uint8Array`, `Int32Array`) with dynamic $O(1)$ amortized memory expansion.
  - Generates multi-thousand step space-time diagrams in single-digit milliseconds.
- **Space-Time Diagrams**:
  - Each horizontal line represents the tape at a specific time step $t$ ($t=0, 1, 2, \dots$ progressing downward).
  - **No grid**: Crisp, raw pixel rendering without distracting cell outlines.
  - **Grayscale Contrast**: Symbol `0` is always pure Black (`#000000`), the highest symbol is pure White (`#FFFFFF`), and intermediate symbols are evenly interpolated shades of gray.
  - Optional **Head Path Overlay** tracing the trajectory of the tape head across spacetime.
  - Interactive Pan and Zoom (mouse wheel & drag).
  - One-click high-resolution **PNG Export**.
- **Input Formats**:
  - **bbchallenge standard format**: Direct support for the Busy Beaver Challenge notation (e.g. `1RB1LB_1LA1RZ`, `1RB1LC_1RC1RB_1RD0LE_1LA1LD_1RZ0LA`).
  - **Direct Transition Table Matrix**: Fully interactive visual grid to view, edit, add, or remove states and symbols with real-time two-way synchronization.
  - Supports arbitrary number of states ($A, B, C, \dots$) and symbols ($0, 1, 2, \dots$).
  - Graceful handling of halt transitions (`---`, `...`, `1RZ`, `0RZ`, `H`, etc.).
- **Custom Starting Tape**:
  - Run machines on blank tapes or enter custom initial tape patterns (e.g. `1101`, `101010`, `0 1 2 1`).
  - Configure initial head position and starting state.
  - Quick presets: Blank ($0$), Unary ($11111$), Binary ($42$), Alternating ($101010$), and Random patterns.
- **Explore Mode & Inspector**:
  - Click **Explore Mode** to travel through time!
  - Scroll down the space-time diagram or drag the timeline scrubber to inspect any step $t$.
  - **1D Physical Tape Ribbon**: Visual strip showing cells surrounding the head with cell values, positions, and an animated Head Pointer indicator `▲ [State]`.
  - **State Card**: Live readouts of head position $x$, current state, symbol under head, executed transition rule, tape span, and active non-zero count ($\Sigma$).
  - Full playback controls: Play/Pause, Step Forward (+1), Step Backward (-1), Jump to Start, Jump to Halt/End, and adjustable playback speed.
- **Themes**:
  - **Monochrome** *(Default)*: Black=0, White=Max symbol, dark slate UI.
  - **Amber CRT Phosphor**: Retro amber terminal glow.
  - **Matrix Green Terminal**: Cyberpunk hacker phosphor green.
  - **Cyberpunk Neon**: Electric cyan, hot pink, and deep violet.
  - **Solarized Dark**: Classic Ethan Schoonover palette.
  - **Synthwave 80s**: Deep purple to neon magenta.
  - **Blueprint CAD**: Navy blue with architectural chalk white.
  - **Paper Light**: High-contrast inverted paper mode.
- **Built-in Iconic Presets**:
  - **BB(2)** Champion ($6$ steps, $4$ ones)
  - **BB(3)** Champion ($21$ steps, $5$ ones)
  - **BB(4)** Champion ($107$ steps, $13$ ones)
  - **BB(5)** Champion (Marxen & Buntrock — $47,176,870$ steps)
  - **BB(2,3)** Multi-Symbol Champion ($38$ steps, $9$ non-zeros)
  - **Antihydra** (6-state Collatz-like machine)
  - **Binary Incrementer**
  - **Ping-Pong Oscillator**
  - **Sierpinski Fractal Generator**

---

## 📖 The bbchallenge Format

In the standard [bbchallenge](https://bbchallenge.org) notation:
- Transitions are specified as 3-character blocks: `[WriteSymbol][Direction][NextState]`.
  - Example: `1RB` means *write `1`, move `Right`, transition to `State B`*.
  - Example: `0LA` means *write `0`, move `Left`, transition to `State A`*.
  - Example: `1RZ` or `---` represents a *Halt* transition.
- Transitions for each symbol are listed sequentially starting with symbol $0$:
  - `[Rule for 0][Rule for 1][Rule for 2]...`
- States are separated by an underscore (`_`):
  - `[State A Rules]_[State B Rules]_[State C Rules]...`

### Example: BB(4) Champion
```text
1RB1LB_1LA0LC_1RZ1LD_1RD0RA
```
- **State A:** Read `0` $\rightarrow$ `1RB`; Read `1` $\rightarrow$ `1LB`
- **State B:** Read `0` $\rightarrow$ `1LA`; Read `1` $\rightarrow$ `0LC`
- **State C:** Read `0` $\rightarrow$ `1RZ` *(Halt)*; Read `1` $\rightarrow$ `1LD`
- **State D:** Read `0` $\rightarrow$ `1RD`; Read `1` $\rightarrow$ `0RA`

---

## 🏃 Running the Simulator

Zero external build tools or installations are required!

### Option 1: Direct File Opening
Double-click `index.html` in your web browser.

### Option 2: Local HTTP Server
Using Python:
```bash
python -m http.server 8000
```
Or using Node / npx:
```bash
npx serve .
```
Then navigate to `http://localhost:8000` or `http://localhost:3000`.

---

## 🧪 Testing

To run the automated test suite verifying bbchallenge parsing, Busy Beaver records, and execution benchmarks:

```bash
node test.js
```

---

## ⌨️ Controls & Shortcuts

| Action | Control |
| :--- | :--- |
| **Pan Diagram** | Left-click and drag on canvas |
| **Zoom In / Out** | Mouse wheel scroll |
| **Jump to Step** | Click anywhere on the space-time diagram |
| **Play / Pause** | `Spacebar` or Play button |
| **Step Forward (+1)** | `ArrowRight` or `ArrowDown` |
| **Step Backward (-1)** | `ArrowLeft` or `ArrowUp` |
| **Export Image** | Click "Export PNG" |

---

## 📄 License

MIT License. Designed with performance and precision.
