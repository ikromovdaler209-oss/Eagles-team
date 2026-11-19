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
      location.replace(destination());
    } else {
      for (const button of document.querySelectorAll('[data-choose-language]')) {
        button.addEventListener('click', () => {
          localStorage.setItem('eaglesLanguage', button.dataset.chooseLanguage);
          location.replace(destination());
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
