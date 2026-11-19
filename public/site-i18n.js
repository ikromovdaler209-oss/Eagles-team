(() => {
  const languages = ['en', 'ru', 'uz'];
  const current = ['eaglesLanguage', 'eagles-language', 'eagles_lang']
    .map(key => localStorage.getItem(key)).find(value => languages.includes(value));
  const chooser = document.querySelector('[data-choose-language]');
  const home = '/Eagles-homepage.html';

  function destination() {
    const stored = sessionStorage.getItem('eaglesAfterLanguage');
    sessionStorage.removeItem('eaglesAfterLanguage');
    if (!stored) return home;
    const url = new URL(stored, location.origin);
    return url.origin === location.origin && /^\/[\w.-]+\.html$/.test(url.pathname)
      && url.pathname !== '/index.html' ? url.pathname + url.search + url.hash : home;
  }

  if (chooser) {
    if (current) {
      const next = destination();
      if (new URL(next, location.origin).pathname === home &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        sessionStorage.setItem('eaglesIntro', '1');
      }
      location.replace(next);
    } else {
      let leaving = false;
      for (const button of document.querySelectorAll('[data-choose-language]')) {
        button.addEventListener('click', () => {
          if (leaving) return;
          leaving = true;
          localStorage.setItem('eaglesLanguage', button.dataset.chooseLanguage);
          const next = destination();
          if (new URL(next, location.origin).pathname !== home ||
              matchMedia('(prefers-reduced-motion: reduce)').matches) {
            location.replace(next);
            return;
          }
          sessionStorage.setItem('eaglesIntro', '1');
          const veil = document.createElement('div');
          veil.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647';
          document.body.appendChild(veil);
          if (veil.animate) veil.animate([{opacity: 0}, {opacity: 1}], {duration: 500});
          setTimeout(() => location.replace(next), 520);
        });
      }
    }
    return;
  }
  if (!current) {
    sessionStorage.setItem('eaglesAfterLanguage', location.pathname + location.search + location.hash);
    location.replace('/index.html');
    return;
  }
  localStorage.setItem('eaglesLanguage', current);
  document.documentElement.lang = current;
  const column = languages.indexOf(current) - 1;
  function translate(source) {
    const key = source.trim().replace(/\s+/g, ' ');
    const value = window.eaglesCopy[key]?.[column];
    return value ? source.replace(/\S[\s\S]*\S|\S/, () => value) : source;
  }
  window.eaglesTranslate = source => translate(window.eaglesTranslationKeys[source] || source);
  for (const field of document.querySelectorAll('form input, form select')) {
    field.addEventListener('input', () => field.setCustomValidity(''));
    field.addEventListener('invalid', () => {
      const validity = field.validity;
      let message = 'Please check this field.';
      if (validity.valueMissing) message = 'Please fill in all required fields.';
      else if (validity.typeMismatch && field.type === 'email') message = 'Enter a valid email address.';
      else if (validity.tooShort && field.type === 'password') message = 'Use at least 8 characters.';
      else if (field.name === 'age') message = 'Please enter a valid age.';
      field.setCustomValidity(translate(message));
    });
  }
  if (current === 'en') return;

  const nodes = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (nodes.nextNode()) {
    const node = nodes.currentNode;
    if (!node.parentElement.closest('script, style')) node.data = translate(node.data);
  }
  for (const attribute of ['placeholder', 'alt', 'aria-label', 'title', 'content']) {
    const selector = attribute === 'content' ? 'meta[name="description"]' : '[' + attribute + ']';
    for (const element of document.querySelectorAll(selector)) {
      element.setAttribute(attribute, translate(element.getAttribute(attribute)));
    }
  }
})();
