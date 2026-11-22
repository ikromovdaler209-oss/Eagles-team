import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const read = name => readFileSync(join(pub, name), 'utf8');
const includes = (name, needle) => assert.ok(read(name).includes(needle), `${name}: missing ${needle}`);
const pageNames = [
  'Eagles-homepage.html', 'Eagles-about.html', 'Eagles-contacts.html',
  'Eagles-teachers.html', 'Eagles.courses.html', 'practice.html',
  'account.html', 'student-dashboard.html', 'admin.html', 'quiz-live.html',
  'quiz-builder.html', 'quiz-statistics.html', 'reading.html',
  'listening.html', 'speaking.html', 'speaking-review.html', 'Writing.html'
];

// Verify that all locally referenced documents, scripts and stylesheets resolve;
// images and media intentionally excluded from the shared source archive.
for (const name of pageNames) {
  const html = read(name);
  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
    let target = match[2].split(/[?#]/)[0];
    if (!target || /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(target)) continue;
    target = target.replace(/^\//, '');
    if (!/\.(?:html|css|js|svg)$/i.test(target)) continue;
    assert.ok(existsSync(join(pub, target)), `${name}: missing linked file ${target}`);
  }
  const ids = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(m => m[2]);
  assert.equal(new Set(ids).size, ids.length, `${name}: duplicated HTML id`);
}

includes('site-nav.css', '.site-nav.is-open');
includes('site-nav.css', '.site-nav a:is([href="join.html"], .account-cta)::after');
includes('site-nav.css', '.site-nav a:not(.account-cta)');
includes('practice.css', '.practice-live-grid:has(#practiceBuilderCard[hidden])');
includes('quiz-builder.css', '.qb-top .qb-actions');
includes('quiz-builder.css', '#previewDialog');
includes('quiz-live.css', '.live-answers button:focus-visible');
includes('portal-ux.css', '.admin-page .admin-filters input');
includes('reading.css', '.reading > header .back');
includes('speaking-recording.css', '.speaking-controls');
includes('speaking-review.css', '.speaking-review-back');
includes('quiz-statistics.css', '.stats-participants');
includes('quiz-builder.html', 'EAGLES TEAM · TEST TOOLS');
assert.ok(read('quiz-live.html').includes('id="gameTimer"'));
assert.ok(read('student-dashboard.html').includes('id="workspace"'));
assert.ok(read('practice.html').includes('id="practiceBuilderCard"'));
console.log(`UI final polish static QA: PASS (${pageNames.length} pages, links, IDs, component hooks)`);
