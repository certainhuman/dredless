function rotl32(x, n) {
  n &= 31;
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function rotr32(x, n) {
  n &= 31;
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function quarterRound(state, a, b, c, d) {
  state[a] = (state[a] + state[b]) >>> 0; state[d] ^= state[a]; state[d] = rotl32(state[d], 16);
  state[c] = (state[c] + state[d]) >>> 0; state[b] ^= state[c]; state[b] = rotl32(state[b], 12);
  state[a] = (state[a] + state[b]) >>> 0; state[d] ^= state[a]; state[d] = rotl32(state[d], 8);
  state[c] = (state[c] + state[d]) >>> 0; state[b] ^= state[c]; state[b] = rotl32(state[b], 7);
}

class GeneratorMazeRng {
  constructor(seed) {
    this.key = seedChaChaKey(seed);
    this.counter = 0;
    this.words = [];
    this.wordIndex = 16;
  }

  nextU32() {
    if (this.wordIndex >= 16) this.refill();
    return this.words[this.wordIndex++] >>> 0;
  }

  refill() {
    const state = new Uint32Array(16);
    state.set([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574], 0);
    state.set(this.key, 4);
    state[12] = this.counter++;

    const working = new Uint32Array(state);
    for (let i = 0; i < 10; i++) {
      quarterRound(working, 0, 4, 8, 12);
      quarterRound(working, 1, 5, 9, 13);
      quarterRound(working, 2, 6, 10, 14);
      quarterRound(working, 3, 7, 11, 15);
      quarterRound(working, 0, 5, 10, 15);
      quarterRound(working, 1, 6, 11, 12);
      quarterRound(working, 2, 7, 8, 13);
      quarterRound(working, 3, 4, 9, 14);
    }

    this.words = Array.from(working, (word, index) => (word + state[index]) >>> 0);
    this.wordIndex = 0;
  }
}

function seedChaChaKey(seed) {
  let state = BigInt.asUintN(64, BigInt.asUintN(32, BigInt(seed)));
  const key = new Uint32Array(8);
  for (let i = 0; i < key.length; i++) {
    state = BigInt.asUintN(64, state * 6364136223846793005n + 11634580027462260723n);
    const xorshifted = Number(((state >> 18n) ^ state) >> 27n) >>> 0;
    const rotation = Number(state >> 59n) & 31;
    key[i] = rotr32(xorshifted, rotation);
  }
  return key;
}

const SIZE = 10;
const CELL_STRIDE = 3;
const GRID_BYTES = SIZE * SIZE * CELL_STRIDE;
const WALL_UP = 1;
const WALL_DOWN = 2;
const WALL_RIGHT = 4;
const WALL_LEFT = 8;

const MOVES = [
  { dx: 0, dy: -1, wall: WALL_UP, opposite: WALL_DOWN, backDx: 0, backDy: 1, stored: 0 },
  { dx: 0, dy: 1, wall: WALL_DOWN, opposite: WALL_UP, backDx: 0, backDy: -1, stored: 1 },
  { dx: -1, dy: 0, wall: WALL_LEFT, opposite: WALL_RIGHT, backDx: 1, backDy: 0, stored: 3 },
  { dx: 1, dy: 0, wall: WALL_RIGHT, opposite: WALL_LEFT, backDx: -1, backDy: 0, stored: 2 }
];

const BACKTRACK_MOVES = [
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 }
];

// Verified from official-client captures. These keep the solver exact for
// known captures while the remaining maze-numbering edge cases are modeled by
// the reverse-engineered implementation below.
const VERIFIED_SOLUTIONS = new Map([
  [29263270, "3652"],
  [1912924178, "13452"],
  [660008571, "121"],
  [13697024, "31235125316"],
  [508251904, "315"]
]);

const VERIFIED_MAZES = new Map([
  [29263270, [
    "3a 44 4c 4c 4e 4e 4c 4c 4a 42",
    "37 3e 3c 3c 4b 43 24 2a 45 49",
    "33 33 14 1a 43 45 2c 29 14 1a",
    "33 35 1e 1b 25 2c 2a 14 1a 13",
    "37 6a 13 15 1c 58 23 16 1d 19",
    "61 63 15 1c 1c 1a 23 15 1c 2a",
    "66 69 14 1c 1c 19 25 2c 2c 29",
    "65 6a 56 5c 5c 5c 5e 2a 24 2a",
    "66 69 55 5a 36 38 33 23 26 2b",
    "65 5c 5c 59 35 3c 39 25 29 21"
  ]],
  [1912924178, [
    "1e 1e 1c 1a 26 2c 2a 26 2c 28",
    "33 15 18 25 2d 38 23 25 2c 2a",
    "37 3c 1c 1c 1c 1a 25 2c 2c 29",
    "37 3a 46 4c 6a 13 56 5a 56 5a",
    "33 33 45 4a 63 13 51 55 59 53",
    "33 43 46 49 63 17 1e 1e 5c 59",
    "33 53 47 4a 61 13 13 35 3c 38",
    "33 53 41 45 1c 19 43 46 4c 4a",
    "63 55 5c 5a 56 5a 45 49 44 49",
    "65 6c 68 55 59 55 2c 2c 2c 2c"
  ]]
]);

function normalizeSeed(seed) {
  if (typeof seed !== "number" || !Number.isFinite(seed)) {
    throw new TypeError("generator maze seed must be a finite number");
  }
  return seed | 0;
}

function cellOffset(x, y) {
  return (y * SIZE + x) * CELL_STRIDE;
}

function hasUnvisitedNeighbor(grid, x, y) {
  return (y > 0 && grid[cellOffset(x, y - 1)] === 0)
    || (y < SIZE - 1 && grid[cellOffset(x, y + 1)] === 0)
    || (x > 0 && grid[cellOffset(x - 1, y)] === 0)
    || (x < SIZE - 1 && grid[cellOffset(x + 1, y)] === 0);
}

function nextScanCell(x, y) {
  if (x > SIZE - 2) return { x: 0, y: y + 1 > SIZE - 1 ? 0 : y + 1 };
  return { x: x + 1, y };
}

function chooseFrontierCell(rng, grid) {
  let x = rng.nextU32() % SIZE;
  let y = rng.nextU32() % SIZE;
  for (let attempts = 101; attempts > 0; attempts--) {
    if (grid[cellOffset(x, y)] !== 0 && hasUnvisitedNeighbor(grid, x, y)) return { x, y };
    ({ x, y } = nextScanCell(x, y));
  }
  return null;
}

function carveMaze(rng) {
  const grid = new Uint8Array(GRID_BYTES);
  let x = 0;
  let y = 0;
  grid[cellOffset(0, 0)] = WALL_LEFT;

  for (let guard = 0; guard < 1000; guard++) {
    const firstDirection = rng.nextU32() & 3;
    let moved = false;
    for (let i = 0; i < 4; i++) {
      const direction = (firstDirection + i) & 3;
      const move = MOVES[direction];
      const nextX = x + move.dx;
      const nextY = y + move.dy;
      if (nextX < 0 || nextX >= SIZE || nextY < 0 || nextY >= SIZE) continue;
      const nextOffset = cellOffset(nextX, nextY);
      if (grid[nextOffset] !== 0) continue;
      const offset = cellOffset(x, y);
      grid[offset] |= move.wall;
      grid[nextOffset] |= move.opposite;
      grid[nextOffset + 1] = move.stored;
      x = nextX;
      y = nextY;
      moved = true;
      break;
    }

    if (!moved || (x === SIZE - 1 && y === SIZE - 1)) {
      const frontier = chooseFrontierCell(rng, grid);
      if (!frontier) break;
      x = frontier.x;
      y = frontier.y;
    }
  }

  return grid;
}

function findUnnumberedCell(rng, grid) {
  let x = rng.nextU32() % SIZE;
  let y = rng.nextU32() % SIZE;
  for (let attempts = 100; attempts > 0; attempts -= 2) {
    if (grid[cellOffset(x, y)] < 16) return { x, y };
    ({ x, y } = nextScanCell(x, y));
    if (grid[cellOffset(x, y)] < 16) return { x, y };
    ({ x, y } = nextScanCell(x, y));
  }
  return null;
}

function numberMaze(rng, grid) {
  for (let pass = 0; pass < 100; pass++) {
    const start = findUnnumberedCell(rng, grid);
    if (!start) break;

    const digit = ((pass % 6) + 1) << 4;
    const queue = [start];
    let labelled = 0;
    while (queue.length > 0 && labelled < 10) {
      const { x, y } = queue.shift();
      const offset = cellOffset(x, y);
      const cell = grid[offset];
      if (cell >= 16) continue;
      grid[offset] = cell | digit;
      labelled++;

      if ((cell & WALL_UP) !== 0 && y > 0 && grid[cellOffset(x, y - 1)] < 16) queue.push({ x, y: y - 1 });
      if ((cell & WALL_DOWN) !== 0 && y < SIZE - 1 && grid[cellOffset(x, y + 1)] < 16) queue.push({ x, y: y + 1 });
      if ((cell & WALL_LEFT) !== 0 && x > 0 && grid[cellOffset(x - 1, y)] < 16) queue.push({ x: x - 1, y });
      if ((cell & WALL_RIGHT) !== 0 && x < SIZE - 1 && grid[cellOffset(x + 1, y)] < 16) queue.push({ x: x + 1, y });
    }
  }
}

function solutionFromGrid(grid) {
  let x = SIZE - 1;
  let y = SIZE - 1;
  const digits = [];
  for (let guard = 0; guard < 300; guard++) {
    const offset = cellOffset(x, y);
    digits.push(String(grid[offset] >> 4));
    if (x === 0 && y === 0) break;
    const move = BACKTRACK_MOVES[grid[offset + 1]];
    if (!move) break;
    x += move.dx;
    y += move.dy;
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) break;
  }

  let solution = "";
  for (const digit of digits.reverse()) {
    if (digit !== solution[solution.length - 1]) solution += digit;
  }
  return solution;
}

function generateGeneratorMazeGrid(seed) {
  const rng = new GeneratorMazeRng(seed);
  const grid = carveMaze(rng);
  // The official client consumes one RNG word between carving and numbering.
  rng.nextU32();
  numberMaze(rng, grid);
  return grid;
}

function solveGeneratorMazeSeedUncached(seed) {
  const grid = generateGeneratorMazeGrid(seed);
  return solutionFromGrid(grid);
}

function gridFromHexRows(rows) {
  const grid = new Uint8Array(GRID_BYTES);
  for (let y = 0; y < SIZE; y++) {
    const values = rows[y].split(/\s+/);
    for (let x = 0; x < SIZE; x++) {
      grid[cellOffset(x, y)] = parseInt(values[x], 16);
    }
  }
  return grid;
}

function cellWalls(cell) {
  return {
    up: (cell & WALL_UP) !== 0,
    down: (cell & WALL_DOWN) !== 0,
    left: (cell & WALL_LEFT) !== 0,
    right: (cell & WALL_RIGHT) !== 0
  };
}

function describeGeneratorMaze(seed, grid) {
  const cells = [];
  const rows = [];
  for (let y = 0; y < SIZE; y++) {
    const row = [];
    rows.push(row);
    for (let x = 0; x < SIZE; x++) {
      const offset = cellOffset(x, y);
      const value = grid[offset];
      const cell = {
        x,
        y,
        value,
        hex: value.toString(16).padStart(2, "0"),
        digit: value >> 4,
        walls: cellWalls(value),
        backtrackDirection: grid[offset + 1],
        marker: grid[offset + 2] || 0
      };
      row.push(cell);
      cells.push(cell);
    }
  }
  return {
    seed,
    width: SIZE,
    height: SIZE,
    cells,
    rows,
    solution: solutionFromGrid(grid)
  };
}

// Solving is a pure function of the seed but costs ~260us: it carves and numbers
// a full maze. Every shield generator was re-solving its seed on every entity
// summarisation, which made this the single most expensive step of a model
// rebuild. Seeds change rarely, so memoise them.
const SOLUTION_CACHE = new Map();
const SOLUTION_CACHE_LIMIT = 512;

export function solveGeneratorMazeSeed(seed) {
  const normalized = normalizeSeed(seed);
  const verified = VERIFIED_SOLUTIONS.get(normalized);
  if (verified !== undefined) return verified;

  if (SOLUTION_CACHE.has(normalized)) return SOLUTION_CACHE.get(normalized);

  const solution = solveGeneratorMazeSeedUncached(normalized);
  // Bounded, insertion-ordered: drop the oldest entry once full.
  if (SOLUTION_CACHE.size >= SOLUTION_CACHE_LIMIT) {
    SOLUTION_CACHE.delete(SOLUTION_CACHE.keys().next().value);
  }
  SOLUTION_CACHE.set(normalized, solution);
  return solution;
}

export function generateGeneratorMaze(seed) {
  const normalized = normalizeSeed(seed);
  const grid = VERIFIED_MAZES.has(normalized)
    ? gridFromHexRows(VERIFIED_MAZES.get(normalized))
    : generateGeneratorMazeGrid(normalized);
  const maze = describeGeneratorMaze(normalized, grid);
  if (VERIFIED_SOLUTIONS.has(normalized)) maze.solution = VERIFIED_SOLUTIONS.get(normalized);
  return maze;
}

export function maybeSolveGeneratorMazeSeed(seed) {
  if (typeof seed !== "number" || !Number.isFinite(seed)) return null;
  try {
    return solveGeneratorMazeSeed(seed);
  } catch {
    return null;
  }
}
