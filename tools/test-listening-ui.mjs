import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = file => readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');
const html = source('listening.html');
const practice = source('practice.html');
const nav = source('site-nav.js');
const js = source('listening.js');
const css = source('listening.css');
const copy = source('site-copy.js');

assert.match(practice, /href="listening\.html"/);
assert.doesNotMatch(practice, /<article class="card disabled"><span class="symbol">♫<\/span>/);
assert.match(nav, /'listening\.html'/);
assert.match(html, /<body data-practice-page>/);
assert.match(html, /id="practiceGate"/);
assert.match(html, /src="site-nav\.js"/);
assert.equal((html.match(/role="tab"/g) || []).length, 4);
assert.equal((html.match(/role="tabpanel"/g) || []).length, 4);
for (let n = 1; n <= 4; n++) {
  assert.match(html, new RegExp(`id="listeningPanel${n}"`));
  assert.match(html, new RegExp(`data-listening-tab="${n}"`));
}
assert.match(html, /Audio playback is not connected yet/);
assert.match(html, /<button class="listening-play"[^>]*disabled/);
assert.ok((html.match(/\bdisabled\b/g) || []).length >= 8);
assert.match(css, /@media\(max-width:560px\)/);
assert.doesNotMatch(js, /\b(fetch|request|localStorage|sessionStorage|Audio|MediaRecorder|setInterval|setTimeout)\s*\(/);
assert.match(copy, /Explore the upcoming IELTS Listening interface/);
new vm.Script(js);
new vm.Script(copy);
console.log('PASS — Listening preview content, access gating, localization and no audio/backend logic');
