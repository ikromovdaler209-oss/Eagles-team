"use strict";
// UI preview only: section navigation, no audio, countdown, answers, or API calls.
(() => {
  const tabs = Array.from(document.querySelectorAll('[data-listening-tab]'));
  const panels = Array.from(document.querySelectorAll('[data-listening-panel]'));
  const counter = document.getElementById('listeningSectionCount');
  if (tabs.length !== 4 || panels.length !== 4 || !counter) return;

  function activate(tab, focus = false) {
    const id = tab.dataset.listeningTab;
    for (const item of tabs) {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.listeningPanel !== id;
    counter.textContent = id.padStart(2, '0');
    if (focus) tab.focus();
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(tabs[next], true);
    });
  }
})();
