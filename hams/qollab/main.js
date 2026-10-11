/**
 * Mycelium boot: preserve deep links, boot the simulation engine, then wire the game shell.
 */
import { initApp } from './game/app.js';

const initialLevel = window.location.hash.replace('#', '');
initApp();

const home = document.getElementById('myc-home');
const map = document.getElementById('myc-map');
const back = document.getElementById('myc-back-to-map');
const validLevel = id => /^([1-4])-([1-3])$/.test(id) && !(id.startsWith('4-') && !['4-1','4-2'].includes(id)) && id !== '1-4' && id !== '3-3';
let lastPlayedLevel = validLevel(initialLevel) ? initialLevel : '1-1';
const completedLevels = new Set();
const showScreen = name => {
  document.body.dataset.mycScreen = name;
  home.hidden = name !== 'home';
  map.hidden = name !== 'map';
  back.hidden = name !== 'play';
  if (name === 'map') updateProgress();
};
const startLevel = id => {
  const level = validLevel(id) ? id : '1-1';
  lastPlayedLevel = level;
  if (window.location.hash === `#${level}`) {
    showScreen('play');
  } else {
    window.location.hash = level;
    showScreen('play');
  }
};
const updateProgress = () => {
  const el = document.getElementById('myc-progress-count');
  if (el) el.textContent = `${Math.min(10, completedLevels.size)} / 10`;
  document.querySelectorAll('[data-myc-level]').forEach(button => {
    const done = completedLevels.has(button.dataset.mycLevel);
    button.classList.toggle('completed', done);
    const arrow = button.querySelector('b');
    if (arrow) arrow.textContent = done ? '✓' : '→';
  });
};
const lastLevel = () => lastPlayedLevel;

document.querySelectorAll('[data-myc-action]').forEach(button => {
  button.addEventListener('click', () => {
    const action = button.dataset.mycAction;
    if (action === 'home') showScreen('home');
    else if (action === 'levels') showScreen('map');
    else if (action === 'new') startLevel('1-1');
    else if (action === 'continue') startLevel(lastLevel());
  });
});
document.querySelectorAll('[data-myc-level]').forEach(button => {
  button.addEventListener('click', () => startLevel(button.dataset.mycLevel));
});
back.addEventListener('click', () => showScreen('map'));

// Return to the chosen chapter map when the game-level hash is changed elsewhere.
window.addEventListener('hashchange', () => {
  const level = window.location.hash.replace('#', '');
  if (validLevel(level)) lastPlayedLevel = level;
});
window.addEventListener('mycelium-level-completed', event => {
  if (event.detail?.levelId) completedLevels.add(event.detail.levelId);
  updateProgress();
});

// Direct links open straight into the puzzle. Normal launches begin with the title screen.
showScreen(validLevel(initialLevel) ? 'play' : 'home');
