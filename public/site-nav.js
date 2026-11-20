(() => {
  const nav = document.getElementById('mainNav');
  const button = document.querySelector('.site-toggle');
  if (!nav || !button) return;

  const restrictedPage = ['practice.html', 'Writing.html', 'speaking.html']
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

  function appendAccountLink(href, label) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = translate(label);
    if (location.pathname === href) link.setAttribute('aria-current', 'page');
    const join = nav.querySelector('a[href="join.html"]');
    nav.insertBefore(link, join);
  }

  // The standard public nav is the guest state. Never trust a stored token to grant access.
  // Verify the account status and permissions against the existing server endpoint.
  async function checkAccount() {
    if (!sessionStorage.getItem('eaglesIdToken') && !sessionStorage.getItem('eaglesRefreshToken')) {
      return null;
    }
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
        if (gateMessage) gateMessage.hidden = true;
        const builderCard = document.getElementById('practiceBuilderCard');
        if (builderCard && (role === 'admin' || me.profile?.canCreateTests === true)) {
          builderCard.hidden = false;
        }
      }
      if (role === 'admin') {
        appendAccountLink('/admin.html', 'Admin Panel');
      } else {
        appendAccountLink('/student-dashboard.html', 'My account');
      }
      nav.querySelector('a[href="join.html"]')?.remove();
      if (!permitted && restrictedPage) location.replace('/student-dashboard.html');
    } catch (error) {
      // On a temporary 503/network failure, fail closed. Do not clear valid credentials.
      if (error.code === 401 && restrictedPage) {
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
