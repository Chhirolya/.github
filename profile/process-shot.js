#!/usr/bin/env node
// process-shot.js — Called by GitHub Actions when someone opens a "fire X" issue
//
// Usage: node process-shot.js <coordinate>
// e.g.:  node process-shot.js B5

const { loadState, saveState, newGame, generateReadme } = require('./game.js');
const fs = require('fs');

const coord = (process.argv[2] || '').toUpperCase().trim();

if (!coord) {
  console.error('❌ No coordinate provided. Usage: node process-shot.js B5');
  process.exit(1);
}

// Handle "new game" command
if (coord === 'NEW' || coord === 'NEWGAME') {
  const state = newGame();
  saveState(state);
  const readme = generateReadme(state);
  fs.writeFileSync('README.md', readme);
  console.log('🆕 New game started!');
  process.exit(0);
}

// Load or create state
let state = loadState();
if (!state) {
  console.log('No game state found — starting new game');
  state = newGame();
}

// If game already won, start a new one
if (state.status === 'won') {
  console.log('Previous game was won — starting a new game automatically');
  state = newGame();
}

// Fire the shot
const { fireShot } = require('./game.js');
const result = fireShot(state, coord);

if (result.error) {
  console.error(`❌ ${result.error}`);
  // Still regenerate README (to keep it in sync) but exit non-zero
  const readme = generateReadme(state);
  fs.writeFileSync('README.md', readme);
  saveState(state);
  process.exit(1);
}

saveState(state);

const readme = generateReadme(state);
fs.writeFileSync('README.md', readme);

// Summary output for GitHub Actions log
const resultIcon = result.result === 'hit' ? '💥 HIT' : '🌊 Miss';
console.log(`${resultIcon} at ${coord}`);
if (result.sunk) {
  console.log(`⚓ SUNK the ${result.sunk.name}!`);
}
if (result.allSunk) {
  console.log(`🎉 ALL SHIPS SUNK! Game over in ${state.totalShots} shots!`);
}
console.log(`   Total: ${state.hits} hits / ${state.totalShots} shots`);
