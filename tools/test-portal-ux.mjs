import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = name => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const js = name => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
function expectIds(file, ids) {
  const source = html(file);
  for (const id of ids) {
    const matches = source.match(new RegExp(`\\bid=["']${id}["']`, 'g')) || [];
    assert.equal(matches.length, 1, `${file}: expected exactly one #${id}`);
  }
}
expectIds('student-dashboard.html', [
  'state','retry','logout','finishProfile','workspace','welcome','profile','edit','password',
  'quizHistoryState','quizHistoryContent','quizTestsTaken','quizAvgAccuracy','quizBestAccuracy',
  'quizLatestAccuracy','quizHistoryList','recentQuizzesHeading','activity','dashboardBuilderLink','feedback',
  'studentInitials','studentIdentityEmail','studentIdentityGroup'
]);
expectIds('admin.html', [
  'adminAccessMessage','adminWorkspace','refresh','students','message','signout',
  'adminTotalStudents','adminPendingStudents','adminApprovedStudents','adminInactiveStudents',
  'adminPendingMetric','studentSearch','studentStatusFilter','studentsSection'
]);
expectIds('account.html', ['register','login','message']);
for (const name of ['student-dashboard.html','admin.html','account.html']) {
  assert.ok(html(name).includes('href="portal-ux.css"'), `${name}: missing portal stylesheet`);
  assert.ok(html(name).includes('src="account-session.js"'), `${name}: missing auth/session script`);
}
const student = js('student-dashboard.js');
const admin = js('admin.js');
assert.match(student, /request\("\/quiz-results\/mine"\)/, 'student result history API preserved');
assert.match(student, /request\("\/dashboard"\)/, 'student dashboard API preserved');
assert.match(admin, /request\("\/me"\)/, 'server role check preserved');
assert.match(admin, /"\/admin\/students"/, 'admin student listing API preserved');
assert.match(admin, /encodeURIComponent\(p\.uid\)/, 'student update route uses safe UID');
assert.match(admin, /studentStatusFilter\.addEventListener/, 'status filter missing');
assert.match(admin, /studentSearch\.addEventListener/, 'student search missing');
assert.match(admin, /textContent/, 'admin fields should be rendered as text');
assert.ok(!admin.includes('innerHTML'), 'admin must not interpolate student data as HTML');
assert.match(js('quiz-statistics.js'), /averageCorrect/, 'room summary must display average correct answers');
const css = js('portal-ux.css');
assert.match(css, /@media\(max-width:700px\)/, 'mobile layout rules missing');
assert.match(css, /\.admin-page table tbody tr \{display:block/, 'mobile student cards missing');
assert.match(js('site-copy.js'), /Your learning, results and account in one place/, 'portal UI translations missing');
console.log('Portal UI v1.3.4: PASS (preserved API hooks, IDs, access checks, translations, responsive rules)');
