(() => {
  const nav = document.getElementById('mainNav');
  const button = document.querySelector('.site-toggle');
  if (!nav || !button) return;

  const restrictedPage = ['practice.html', 'Writing.html', 'speaking.html', 'quiz-live.html', 'reading.html', 'listening.html']
    .includes(decodeURIComponent(location.pathname.split('/').pop()));
  const gateMessage = document.getElementById('practiceGate');
  const translate = label => window.eaglesTranslate?.(label) || label;

  function setOpen(open) {
    button.setAttribute('aria-expanded', String(open));
    const label = open ? 'Close menu' : 'Open menu';
    button.setAttribute('aria-label', translate(label));
    button.textContent = open ? '✕' : '☰';
    nav.classList.toggle('is-open', open);
  }
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') === 'false'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header') && nav.classList.contains('is-open')) setOpen(false);
  });
  matchMedia('(max-width: 72em)').addEventListener('change', () => setOpen(false));

  const accountLink = nav.querySelector('a[href="join.html"]');

  // Read only a login hint, not a trusted role. Permissions still come from /api/me.
  function hasSavedLogin() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        if (storage.getItem('eaglesIdToken') || storage.getItem('eaglesRefreshToken')) return true;
      } catch (_) { /* Storage can be restricted by the browser. */ }
    }
    return false;
  }

  function showAccountLink(status) {
    if (!accountLink) return;
    // Until /api/me confirms the role, point to the sign-in/account page.
    const href = status === 'admin' ? '/admin.html'
      : status === 'unverified' ? '/account.html' : '/student-dashboard.html';
    accountLink.href = href;
    accountLink.textContent = translate('My account');
    accountLink.classList.add('account-cta');
    accountLink.removeAttribute('aria-current');
    if (location.pathname === href) accountLink.setAttribute('aria-current', 'page');
  }

  function showGuestLink() {
    if (!accountLink) return;
    accountLink.href = 'join.html';
    accountLink.textContent = translate('Join Us');
    accountLink.classList.remove('account-cta');
    accountLink.removeAttribute('aria-current');
    if (location.pathname.endsWith('/join.html')) accountLink.setAttribute('aria-current', 'page');
  }

  // Previously verified access is only a presentation hint, never authorization.
  // Restore it synchronously on each page to prevent Practice flashing in/out.
  function practiceHint() {
    for (const storage of [localStorage, sessionStorage]) {
      try { if (storage.getItem('eaglesPracticeAccessHint') === '1') return true; }
      catch (_) { /* Storage may be restricted. */ }
    }
    return false;
  }
  function savePracticeHint(allowed) {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        if (allowed) storage.setItem('eaglesPracticeAccessHint', '1');
        else storage.removeItem('eaglesPracticeAccessHint');
      } catch (_) { /* Storage may be restricted. */ }
    }
  }
  // The link is invisible in CSS until we choose the initial state. This avoids
  // flashing "Join Us" on every page load while a stored login is being checked.
  const savedLogin = hasSavedLogin();
  if (savedLogin) {
    showAccountLink('unverified');
    if (practiceHint()) document.documentElement.classList.add('eagles-practice-hint');
  } else savePracticeHint(false);
  nav.classList.add('account-nav-ready');

  // Never trust a stored token for permissions; verify through the existing API.
  async function checkAccount() {
    if (!savedLogin) return null;
    // Public pages do not load account-session.js. Reuse it rather than duplicating token refresh logic.
    if (typeof request !== 'function') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/account-session.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Authentication service unavailable'));
        document.head.appendChild(script);
      });
    }
    return request('/me');
  }

  async function initialize() {
    try {
      const me = await checkAccount();
      if (!me) {
        if (restrictedPage) location.replace('/account.html');
        return;
      }
      const role = me.status;
      const permitted = role === 'admin' || role === 'approved';
      if (permitted) {
        document.documentElement.classList.add('eagles-practice-enabled');
        savePracticeHint(true);
        if (gateMessage) gateMessage.hidden = true;
        const builderCard = document.getElementById('practiceBuilderCard');
        if (builderCard && (role === 'admin' || me.profile?.canCreateTests === true)) {
          builderCard.hidden = false;
        }
      }
      if (!permitted) {
        savePracticeHint(false);
        document.documentElement.classList.remove('eagles-practice-hint', 'eagles-practice-enabled');
      }
      showAccountLink(role);
      if (!permitted && restrictedPage) location.replace('/student-dashboard.html');
    } catch (error) {
      // An invalid login becomes a guest link. On a temporary outage, keep the
      // neutral My account link; do not display Join Us or grant Practice access.
      const signedOut = error.code === 401 || !hasSavedLogin();
      // Do not retain Practice access while a server check has failed.
      savePracticeHint(false);
      document.documentElement.classList.remove('eagles-practice-hint', 'eagles-practice-enabled');
      if (signedOut) showGuestLink();
      if (signedOut && restrictedPage) {
        location.replace('/account.html');
      } else if (restrictedPage) {
        const notice = gateMessage || document.createElement('p');
        notice.textContent = translate('Unable to verify your account. Please refresh and try again.');
        if (!gateMessage) {
          notice.className = 'practice-access-notice';
          document.querySelector('.site-header')?.after(notice);
        }
      }
    }
  }
  initialize();
})();
