#!/usr/bin/env node
// init-game.js — Creates a fresh game state and generates the initial README

const { newGame, saveState, generateReadme } = require('./game.js');
const fs = require('fs');

const state = newGame();
saveState(state);

const readme = generateReadme(state);
fs.writeFileSync('README.md', readme);

console.log('✅ New Battleship game initialized!');
console.log(`   Ships placed: ${state.ships.map(s => s.name).join(', ')}`);
console.log(`   Total cells: ${Object.keys(state.visibleBoard).length}`);
