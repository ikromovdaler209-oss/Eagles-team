(() => {
  const button = document.querySelector('.site-toggle');
  const nav = document.getElementById('mainNav');
  function setOpen(open) {
    button.setAttribute('aria-expanded', String(open));
    const label = open ? 'Close menu' : 'Open menu';
    button.setAttribute('aria-label', window.eaglesTranslate?.(label) || label);
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
})();
