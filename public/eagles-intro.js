/* Eagles-Community — entry animation.
   Flow: language chooser (index.html) -> fade to black -> Eagles-homepage.html:
   eagle silhouette appears -> eye ignites -> eagle flies into the header logo box.
   Needs: eagles-intro.css */
(() => {
  'use strict';

  const FLAG = 'eaglesIntro';
  let shouldPlay = false;
  try {
    shouldPlay = sessionStorage.getItem(FLAG) === '1';
    sessionStorage.removeItem(FLAG);                // play once per entry through index.html
  } catch (e) {}
  if (!shouldPlay) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const root = document.documentElement;
  root.classList.add('eagles-intro-on');             // page is black from the very first paint

  const SKIP_TEXT = { en: 'Skip', ru: 'Пропустить', uz: 'O‘tkazish' };
  let lang = 'en';
  try { lang = localStorage.getItem('eaglesLanguage') || 'en'; } catch (e) {}

  const EAGLE_SVG = `
<svg class="ei-eagle" viewBox="0 0 1254 1254" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="ei-halo-grad">
      <stop offset="0"    stop-color="#ff5a4a" stop-opacity=".95"/>
      <stop offset=".35"  stop-color="#ff1a1a" stop-opacity=".5"/>
      <stop offset="1"    stop-color="#ff0000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  __FILL__
  __LINE__
  <circle class="ei-halo" cx="808" cy="742" r="150" fill="url(#ei-halo-grad)"/>
  <path class="ei-eye" d="M819.7,766.0C800.6,763.5 790.4,761.8 789.5,760.9C788.1,759.4 762.0,715.4 762.0,714.6C762.0,714.0 785.2,727.3 811.0,742.7C830.9,754.6 854.0,769.1 854.0,769.6C854.0,770.3 848.6,769.7 819.7,766.0Z"/>
</svg>`
    .replace('__FILL__', '<path class="ei-fill" fill-rule="evenodd" d="M812.9,634.2C781.8,610.7 743.0,581.3 711.6,557.2C695.6,545.0 675.5,529.7 667.0,523.3C658.5,516.9 651.3,511.5 651.1,511.4C650.9,511.2 648.4,497.0 645.5,479.8C639.9,447.0 635.7,422.9 620.9,340.5C616.0,313.0 612.1,289.9 612.2,289.1C613.3,283.5 689.5,404.0 747.3,502.5C751.2,509.1 757.8,520.4 762.0,527.5C766.2,534.6 775.7,550.6 783.0,563.0C790.3,575.4 802.7,596.3 810.5,609.5C830.5,643.4 833.2,648.1 832.8,648.6C832.5,648.8 823.6,642.3 812.9,634.2Z"/><path class="ei-fill" fill-rule="evenodd" d="M928.7,913.4C938.5,892.9 931.9,876.7 906.8,860.0C871.8,836.6 817.2,823.6 753.0,823.6C717.0,823.5 695.8,825.8 663.5,833.0C618.9,842.9 572.1,863.5 542.0,886.4C537.2,890.1 535.5,890.8 530.4,891.2C524.6,891.7 524.3,891.7 512.5,884.9C486.9,870.4 462.6,863.5 430.0,861.5C420.5,860.9 395.2,862.2 389.0,863.7C382.6,865.2 409.2,842.0 431.0,827.1C481.7,792.5 542.3,767.2 605.0,754.4C622.3,750.9 649.8,747.0 657.0,747.0C659.2,747.0 661.0,746.6 661.0,746.1C661.0,745.5 653.5,736.3 644.2,725.4C635.0,714.6 624.6,702.3 621.0,698.1C608.9,683.8 592.6,664.6 566.0,633.5C551.4,616.4 528.0,588.9 514.0,572.5C500.0,556.0 477.7,529.9 464.5,514.4C451.3,499.0 434.2,479.0 426.6,469.9C418.9,460.9 409.0,449.2 404.5,444.0C338.8,367.2 301.4,322.3 302.4,321.3C303.1,320.6 418.9,402.6 480.5,447.5C532.4,485.3 612.1,545.3 661.1,583.4C667.6,588.4 687.6,604.0 705.7,618.0C765.7,664.6 859.1,737.7 894.0,765.5C946.4,807.2 958.4,820.0 965.3,841.5C968.7,852.3 968.5,870.2 964.8,878.7C959.3,891.7 948.5,904.5 933.8,915.3C929.5,918.5 925.9,921.0 925.6,921.0C925.3,921.0 926.7,917.6 928.7,913.4Z M854.0,769.6C854.0,769.1 830.9,754.6 811.0,742.7C785.2,727.3 762.0,714.0 762.0,714.6C762.0,715.4 788.1,759.4 789.5,760.9C791.1,762.6 854.0,771.1 854.0,769.6Z"/>').replace('__LINE__', '<path class="ei-line" pathLength="1" d="M812.9,634.2C781.8,610.7 743.0,581.3 711.6,557.2C695.6,545.0 675.5,529.7 667.0,523.3C658.5,516.9 651.3,511.5 651.1,511.4C650.9,511.2 648.4,497.0 645.5,479.8C639.9,447.0 635.7,422.9 620.9,340.5C616.0,313.0 612.1,289.9 612.2,289.1C613.3,283.5 689.5,404.0 747.3,502.5C751.2,509.1 757.8,520.4 762.0,527.5C766.2,534.6 775.7,550.6 783.0,563.0C790.3,575.4 802.7,596.3 810.5,609.5C830.5,643.4 833.2,648.1 832.8,648.6C832.5,648.8 823.6,642.3 812.9,634.2Z"/><path class="ei-line" pathLength="1" d="M928.7,913.4C938.5,892.9 931.9,876.7 906.8,860.0C871.8,836.6 817.2,823.6 753.0,823.6C717.0,823.5 695.8,825.8 663.5,833.0C618.9,842.9 572.1,863.5 542.0,886.4C537.2,890.1 535.5,890.8 530.4,891.2C524.6,891.7 524.3,891.7 512.5,884.9C486.9,870.4 462.6,863.5 430.0,861.5C420.5,860.9 395.2,862.2 389.0,863.7C382.6,865.2 409.2,842.0 431.0,827.1C481.7,792.5 542.3,767.2 605.0,754.4C622.3,750.9 649.8,747.0 657.0,747.0C659.2,747.0 661.0,746.6 661.0,746.1C661.0,745.5 653.5,736.3 644.2,725.4C635.0,714.6 624.6,702.3 621.0,698.1C608.9,683.8 592.6,664.6 566.0,633.5C551.4,616.4 528.0,588.9 514.0,572.5C500.0,556.0 477.7,529.9 464.5,514.4C451.3,499.0 434.2,479.0 426.6,469.9C418.9,460.9 409.0,449.2 404.5,444.0C338.8,367.2 301.4,322.3 302.4,321.3C303.1,320.6 418.9,402.6 480.5,447.5C532.4,485.3 612.1,545.3 661.1,583.4C667.6,588.4 687.6,604.0 705.7,618.0C765.7,664.6 859.1,737.7 894.0,765.5C946.4,807.2 958.4,820.0 965.3,841.5C968.7,852.3 968.5,870.2 964.8,878.7C959.3,891.7 948.5,904.5 933.8,915.3C929.5,918.5 925.9,921.0 925.6,921.0C925.3,921.0 926.7,917.6 928.7,913.4Z M854.0,769.6C854.0,769.1 830.9,754.6 811.0,742.7C785.2,727.3 762.0,714.0 762.0,714.6C762.0,715.4 788.1,759.4 789.5,760.9C791.1,762.6 854.0,771.1 854.0,769.6Z"/>');

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const anims = [];
  const A = (el, frames, opts) => {
    const a = el.animate(frames, Object.assign({ fill: 'forwards' }, opts));
    anims.push(a);
    return a.finished.catch(() => {});
  };

  let overlay, logoMark, done = false, skipped = false;

  function cleanup() {
    if (done) return;
    done = true;
    anims.forEach(a => { try { a.cancel(); } catch (e) {} });
    if (logoMark) { logoMark.style.opacity = ''; logoMark.style.transition = ''; }
    root.classList.remove('eagles-intro-on', 'eagles-intro-lock');
    if (overlay) overlay.remove();
    window.dispatchEvent(new Event('eagles:intro-done'));
  }

  async function run() {
    logoMark = document.querySelector('.site-header .site-mark');
    if (!logoMark) { cleanup(); return; }              // nothing to land on -> no intro
    logoMark.style.opacity = '0';                      // logo box stays hidden until the eagle lands

    overlay = document.createElement('div');
    overlay.id = 'eagles-intro';
    overlay.innerHTML = '<div class="ei-bg"></div>' + EAGLE_SVG +
      '<button class="ei-skip" type="button">' + (SKIP_TEXT[lang] || SKIP_TEXT.en) + '</button>';
    document.body.appendChild(overlay);

    const bg    = overlay.querySelector('.ei-bg');
    const eagle = overlay.querySelector('.ei-eagle');
    const fills = overlay.querySelectorAll('.ei-fill');
    const lines = overlay.querySelectorAll('.ei-line');
    const eye   = overlay.querySelector('.ei-eye');
    const halo  = overlay.querySelector('.ei-halo');
    const skip  = overlay.querySelector('.ei-skip');

    skip.focus({preventScroll: true});
    skip.addEventListener('keydown', event => {
      if (event.key === 'Escape') skip.click();
    });

    skip.addEventListener('click', () => { skipped = true; cleanup(); });
    setTimeout(() => skip.classList.add('is-visible'), 700);
    setTimeout(() => { skipped = true; cleanup(); }, 15000);   // safety net

    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, wait(800)]);
      }
      await wait(250);
      if (skipped) return;

      // 1) silhouette: outline is drawn, then fills from dark to red, glow grows
      const draw = A(eagle, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' }],
                     { duration: 1800, easing: 'ease-out' });
      lines.forEach(l => A(l, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
                     { duration: 1300, easing: 'ease-in-out' }));
      const filled = Promise.all([...fills].map(f => A(f,
                     [{ opacity: 0, fill: '#220306' }, { opacity: 1, fill: '#d4000f' }],
                     { duration: 1300, delay: 800, easing: 'ease-in' })));
      lines.forEach(l => A(l, [{ opacity: 1 }, { opacity: 0 }], { duration: 600, delay: 1700 }));
      A(eagle, [{ filter: 'drop-shadow(0 0 0 rgba(255,30,30,0))' },
                { filter: 'drop-shadow(0 0 28px rgba(255,30,30,.55))' }],
        { duration: 1500, delay: 1000 });
      await Promise.all([draw, filled]);
      if (skipped) return;

      // 2) eye ignites (flicker, then steady pulse)
      A(eye,  [{ opacity: 0 }, { opacity: .95, offset: .3 }, { opacity: .2, offset: .45 },
               { opacity: 1, offset: .7 }, { opacity: .6, offset: .85 }, { opacity: 1 }], { duration: 800 });
      A(halo, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: .8, transform: 'scale(1)' }], { duration: 800 });
      await wait(850);
      if (skipped) return;
      A(halo, [{ opacity: .55, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1.2)' }],
                      { duration: 750, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });

      // 3) eye flash (silent animation)
      A(halo, [{ transform: 'scale(1.2)' }, { transform: 'scale(2)', offset: .25 }, { transform: 'scale(1.2)' }],
        { duration: 600, fill: 'none' });
      await wait(1500);
      if (skipped) return;

      // 4) flight to the logo box
      skip.classList.remove('is-visible'); skip.style.pointerEvents = 'none';
      overlay.style.pointerEvents = 'none';
      root.classList.remove('eagles-intro-on');        // page becomes visible under the fading black
      root.classList.add('eagles-intro-lock');

      const a = eagle.getBoundingClientRect();
      const b = logoMark.getBoundingClientRect();
      const s  = b.width / a.width;
      const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
      const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      const rise = Math.min(innerHeight * 0.18, 140);
      const T = (x, y, sc, r) => `translate(${x}px, ${y}px) scale(${sc}) rotate(${r}deg)`;

      const flight = A(eagle, [
        { transform: T(0, 0, 1, 0),                                        easing: 'cubic-bezier(.3,0,.4,1)' },
        { transform: T(0, -24, 1.07, 0),            offset: .18,           easing: 'cubic-bezier(.45,0,.25,1)' },
        { transform: T(dx * .55, dy * .55 - rise, Math.pow(s, .5), -10), offset: .6, easing: 'cubic-bezier(.3,0,.2,1)' },
        { transform: T(dx, dy, s, 0) }
      ], { duration: 1600, composite: 'replace' });
      A(eagle, [{ filter: 'drop-shadow(0 0 28px rgba(255,30,30,.55))' }, { filter: 'drop-shadow(0 0 0 rgba(255,30,30,0))' }],
        { duration: 1500 });
      A(bg, [{ opacity: 1 }, { opacity: 0 }], { duration: 1100, delay: 150, easing: 'ease-in' });
      A(eye, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
      A(halo, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });

      await wait(1150);                                // eagle is almost home -> show the real logo box
      if (done) return;
      logoMark.style.transition = 'opacity .45s ease';
      logoMark.style.opacity = '1';
      await flight;
      await wait(350);
    } catch (e) {
      console.warn('Eagles intro failed:', e);
    }
    cleanup();
  }

  const start = () => run().catch(cleanup);
  window.addEventListener('pagehide', () => { skipped = true; cleanup(); }, {once: true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
