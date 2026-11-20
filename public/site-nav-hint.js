// Early paint-only hint: keep Practice in the same place while navigating.
// Never use this flag for permissions; site-nav.js and the API recheck /api/me.
(() => {
  function has(key, expected) {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const value = storage.getItem(key);
        if (expected ? value === expected : Boolean(value)) return true;
      } catch (_) { /* Browser storage can be restricted. */ }
    }
    return false;
  }
  if ((has('eaglesIdToken') || has('eaglesRefreshToken')) && has('eaglesPracticeAccessHint', '1')) {
    document.documentElement.classList.add('eagles-practice-hint');
  }
})();
