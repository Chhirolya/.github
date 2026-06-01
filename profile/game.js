// game.js — Battleship core logic
// Reads/writes game-state.json, generates README board

const fs = require('fs');

const STATE_FILE = 'game-state.json';
const COLS = ['A','B','C','D','E','F','G','H','I','J'];
const ROWS = [1,2,3,4,5,6,7,8,9,10];

// Ships: [name, size, emoji]
const SHIP_DEFS = [
  { name: 'Carrier',    size: 5, symbol: '🛸' },
  { name: 'Battleship', size: 4, symbol: '🚢' },
  { name: 'Cruiser',    size: 3, symbol: '⛵' },
  { name: 'Submarine',  size: 3, symbol: '🤿' },
  { name: 'Destroyer',  size: 2, symbol: '🛥️' },
];

function createEmptyBoard() {
  const board = {};
  for (const col of COLS) {
    for (const row of ROWS) {
      board[`${col}${row}`] = 'empty'; // empty | ship | hit | miss
    }
  }
  return board;
}

function placeShipsRandomly(board) {
  const placements = [];
  for (const ship of SHIP_DEFS) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      attempts++;
      const horizontal = Math.random() < 0.5;
      const colIdx = Math.floor(Math.random() * (horizontal ? COLS.length - ship.size + 1 : COLS.length));
      const rowIdx = Math.floor(Math.random() * (horizontal ? ROWS.length : ROWS.length - ship.size + 1));

      const cells = [];
      for (let i = 0; i < ship.size; i++) {
        const c = horizontal ? COLS[colIdx + i] : COLS[colIdx];
        const r = horizontal ? ROWS[rowIdx] : ROWS[rowIdx + i];
        cells.push(`${c}${r}`);
      }

      // Check no overlap
      const hasOverlap = cells.some(cell => board[cell] === 'ship');
      if (!hasOverlap) {
        cells.forEach(cell => { board[cell] = 'ship'; });
        placements.push({ name: ship.name, symbol: ship.symbol, size: ship.size, cells, sunk: false });
        placed = true;
      }
    }
  }
  return placements;
}

function newGame() {
  const board = createEmptyBoard();
  const ships = placeShipsRandomly(board);

  // Store hidden board (with ship positions) separately
  const hiddenBoard = { ...board };

  // Player-visible board shows only empty
  const visibleBoard = {};
  for (const key of Object.keys(board)) {
    visibleBoard[key] = 'empty';
  }

  return {
    version: 1,
    status: 'active',   // active | won
    totalShots: 0,
    hits: 0,
    misses: 0,
    ships,              // includes cell positions — kept in file but not shown on board
    hiddenBoard,        // actual positions (ship | empty)
    visibleBoard,       // what players see (empty | hit | miss)
    moveHistory: [],
  };
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return null;
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function fireShot(state, coord) {
  coord = coord.toUpperCase().trim();

  // Validate coordinate
  const colChar = coord.charAt(0);
  const rowNum = parseInt(coord.slice(1), 10);
  if (!COLS.includes(colChar) || !ROWS.includes(rowNum)) {
    return { error: `Invalid coordinate: ${coord}. Use A-J and 1-10 (e.g. B5)` };
  }

  // Already fired here?
  const vis = state.visibleBoard[coord];
  if (vis === 'hit' || vis === 'miss') {
    return { error: `${coord} was already fired upon!` };
  }

  const isHit = state.hiddenBoard[coord] === 'ship';
  state.visibleBoard[coord] = isHit ? 'hit' : 'miss';
  state.totalShots++;
  if (isHit) state.hits++;
  else state.misses++;

  // Check if any ship is now fully sunk
  let justSunk = null;
  for (const ship of state.ships) {
    if (ship.sunk) continue;
    const allHit = ship.cells.every(c => state.visibleBoard[c] === 'hit');
    if (allHit) {
      ship.sunk = true;
      justSunk = ship;
    }
  }

  // Check win
  const allSunk = state.ships.every(s => s.sunk);
  if (allSunk) state.status = 'won';

  const entry = {
    coord,
    result: isHit ? 'hit' : 'miss',
    sunk: justSunk ? justSunk.name : null,
    by: process.env.GITHUB_ACTOR || 'anonymous',
    at: new Date().toISOString(),
  };
  state.moveHistory.push(entry);

  return { ok: true, result: isHit ? 'hit' : 'miss', sunk: justSunk, allSunk };
}

// ─── README generation ───────────────────────────────────────────────────────

function cellIcon(cell, coord, ships) {
  switch (cell) {
    case 'hit': {
      // Find which ship
      const ship = ships.find(s => s.cells.includes(coord));
      if (ship && ship.sunk) return ship.symbol;
      return '💥';
    }
    case 'miss': return '🌊';
    default:     return '🟦';
  }
}

function buildMoveTable(state) {
  // Only show cells that haven't been fired upon (playable moves)
  const playable = [];
  for (const col of COLS) {
    for (const row of ROWS) {
      const coord = `${col}${row}`;
      if (state.visibleBoard[coord] === 'empty') {
        playable.push(coord);
      }
    }
  }

  if (playable.length === 0) return '';

  // Group by column for readability — show first 30 options
  const shown = playable.slice(0, 60);
  let table = `| Coordinate | Fire! |\n|:---:|:---:|\n`;
  for (const coord of shown) {
    const url = `../../issues/new?title=fire+${coord}&body=Firing+at+${coord}&labels=battleship`;
    table += `| **${coord}** | [🎯 Fire!](${url}) |\n`;
  }
  return table;
}

function buildShipStatus(state) {
  let out = `| Ship | Size | Status |\n|:---|:---:|:---:|\n`;
  for (const ship of state.ships) {
    const hitsOnShip = ship.cells.filter(c => state.visibleBoard[c] === 'hit').length;
    const bar = ship.cells.map((c, i) =>
      state.visibleBoard[c] === 'hit' ? '🔴' : '⬜'
    ).join('');
    const status = ship.sunk ? `${ship.symbol} Sunk!` : `${bar} (${hitsOnShip}/${ship.size})`;
    out += `| ${ship.name} | ${ship.size} | ${status} |\n`;
  }
  return out;
}

function buildBoardMarkdown(state) {
  let board = `|   | A | B | C | D | E | F | G | H | I | J |\n`;
  board    += `|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|\n`;

  for (const row of ROWS) {
    let line = `| **${row}** |`;
    for (const col of COLS) {
      const coord = `${col}${row}`;
      const icon = cellIcon(state.visibleBoard[coord], coord, state.ships);
      line += ` ${icon} |`;
    }
    board += line + '\n';
  }
  return board;
}

function buildLastMoves(state) {
  const recent = state.moveHistory.slice(-5).reverse();
  if (recent.length === 0) return '_No shots fired yet. Be the first!_\n';
  let out = `| # | Player | Coord | Result |\n|:---:|:---|:---:|:---:|\n`;
  for (const m of recent) {
    const sunkNote = m.sunk ? ` ⚓ sank ${m.sunk}!` : '';
    const icon = m.result === 'hit' ? '💥 HIT' : '🌊 Miss';
    out += `| ${state.moveHistory.indexOf(m) + 1} | @${m.by} | **${m.coord}** | ${icon}${sunkNote} |\n`;
  }
  return out;
}

function generateReadme(state) {
  const sunkCount = state.ships.filter(s => s.sunk).length;
  const remaining = state.ships.filter(s => !s.sunk).length;
  const accuracy = state.totalShots > 0
    ? ((state.hits / state.totalShots) * 100).toFixed(1)
    : '0.0';

  const header = state.status === 'won'
    ? `# 🎉 GAME OVER — All ships sunk in ${state.totalShots} shots!\n\n> Start a new game by [opening this issue](../../issues/new?title=new+game&labels=battleship-admin).\n`
    : `# 🚢 Community Battleship\n\n> **Fire a shot** by clicking a coordinate link below. Anyone can play — this is a community game!\n`;

  const stats = `
## 📊 Stats
| Shots fired | Hits | Misses | Accuracy | Ships sunk |
|:---:|:---:|:---:|:---:|:---:|
| ${state.totalShots} | ${state.hits} | ${state.misses} | ${accuracy}% | ${sunkCount} / ${state.ships.length} |
`;

  const boardSection = `
## 🗺️ Battle Grid

${buildBoardMarkdown(state)}

> 🟦 = Unknown &nbsp;&nbsp; 💥 = Hit &nbsp;&nbsp; 🌊 = Miss &nbsp;&nbsp; Sunk ships show their icon
`;

  const shipStatusSection = `
## ⚓ Fleet Status

${buildShipStatus(state)}
`;

  const lastMovesSection = `
## 🕹️ Recent Shots

${buildLastMoves(state)}
`;

  const moveTable = state.status === 'active' ? `
## 🎯 Fire a Shot!

Pick a coordinate and click its link. The game updates automatically via GitHub Actions.

${buildMoveTable(state)}
` : '';

  const legend = `
## 📖 How to play
1. Find a coordinate in the **Fire a Shot** table below.
2. Click its link — it opens a pre-filled GitHub Issue.
3. Submit the issue. A GitHub Action fires automatically.
4. Reload this page in ~30 seconds to see the result!

Ships hidden on the grid: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).
`;

  return [header, stats, boardSection, shipStatusSection, lastMovesSection, moveTable, legend].join('\n');
}

module.exports = { newGame, loadState, saveState, fireShot, generateReadme, COLS, ROWS };
