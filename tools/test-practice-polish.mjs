import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const file = name => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const practice = file('practice.html');
const css = file('practice.css');
const dashboard = file('student-dashboard.html');
const admin = file('admin.html');
const portal = file('portal-ux.css');

// Preserve account-status gating and server-controlled permissions.
assert.match(practice, /<body data-practice-page>/);
assert.match(practice, /id="practiceGate"/);
assert.match(practice, /src="site-nav\.js"/);
assert.match(practice, /id="practiceBuilderCard"[^>]*hidden/);
assert.match(file('site-nav.js'), /me\.profile\?\.canCreateTests === true/);
assert.match(admin, /id="adminWorkspace" hidden/);
assert.match(dashboard, /id="workspace" hidden/);

// All five learning destinations must exist; Listening is explicitly preview-only.
for (const href of ['reading.html','listening.html','Writing.html','speaking.html','quiz-live.html','quiz-builder.html']) {
  assert.match(practice, new RegExp(`href="${href.replaceAll('.', '\\.')}"`), `Missing Practice link ${href}`);
  assert.ok(existsSync(new URL(`../public/${href}`, import.meta.url)), `Missing target ${href}`);
}
assert.equal((practice.match(/class="card skill-card"/g) || []).length, 4);
assert.match(practice, /Preview mode/);
assert.match(practice, /Recording preview/);
assert.match(dashboard, /href="listening\.html"/);
assert.match(dashboard, /Listening is currently a preview/);
assert.doesNotMatch(dashboard, /Listening practice will be available later/);
assert.match(dashboard, /id="quizHistoryList"/);
assert.match(admin, /id="studentsSection"/);
assert.match(admin, /class="admin-tools-grid"/);
assert.match(admin, /href="\/speaking-review\.html"/);
assert.match(admin, /href="\/reading\.html\?manage=1"/);
assert.match(portal, /\.admin-page \.admin-tools-grid/);
assert.match(css, /@media\(max-width:690px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /:focus-visible/);

// Translation keys used by the new elements are available in both supported locales.
const sandbox = { window: {} };
vm.runInNewContext(file('site-copy.js'), sandbox);
for (const key of [
  'Explore practice areas', 'IELTS practice areas', 'Available', 'Preview mode',
  'Recording preview', 'Start practice', 'View preview', 'Open Live Lobby',
  'Live Quiz & test tools', 'Listening is currently a preview; audio and scoring are coming later.'
]) {
  assert.ok(sandbox.window.eaglesCopy[key]?.[0], `Missing Russian: ${key}`);
  assert.ok(sandbox.window.eaglesCopy[key]?.[1], `Missing Uzbek: ${key}`);
}
console.log('Practice Hub v1.5.2: PASS (navigation, role gating, localization, Listening preview, portal selectors)');
