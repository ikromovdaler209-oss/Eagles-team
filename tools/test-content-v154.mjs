import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const {builtIns,getBuiltIn} = require('../server/reading-practice-content.js');
const {cleanTest,grade,publicSections} = require('../server/reading-core.js');

assert.equal(builtIns.size, 3);
assert.equal(getBuiltIn('shade-experiment').count, 3, 'old starter remains unchanged');
for (const [id,source] of builtIns) {
  const test = cleanTest(source);
  const questions = test.sections.flatMap(s => s.questions);
  assert.equal(questions.length, test.count, `${id}: incorrect question count`);
  assert.equal(new Set(questions.map(q => q.prompt.trim())).size, questions.length, `${id}: repeated questions`);
  assert(test.sections.every(s => s.passage.length >= 300), `${id}: empty passage`);
  assert.equal(grade(test.sections,questions.map(q=>q.keys[0])).accuracy,100,`${id}: bad answer key`);
  const empty=grade(test.sections,questions.map(()=>''));
  assert.equal(empty.skipped,questions.length,`${id}: empty answers are not skipped`);
  assert.equal(empty.accuracy,0);
  assert(!JSON.stringify(publicSections(test.sections)).includes('"keys"'), `${id}: answer keys exposed to students`);
  assert(test.sections.every(s => !s.passage.includes('©')));
}
const read = n => readFileSync(new URL('../public/' + n, import.meta.url),'utf8');
const listeningHTML = read('listening.html');
const listeningJS = read('listening.js');
const style = read('listening.css');
for (let n=1;n<=4;n++) {
  const start=listeningHTML.indexOf(`id="listeningPanel${n}"`);
  const end=listeningHTML.indexOf('</section>',start);
  assert(start>=0 && end>start,`Listening panel ${n} missing`);
  const panel=listeningHTML.slice(start,end);
  assert.match(panel, /<details class="listening-sample-script">/);
  assert.match(panel, /This sample script is not an audio recording\./);
  assert.ok((panel.match(/class="listening-example-card"/g)||[]).length >= 3);
  const fields=[...panel.matchAll(/<(?:input|select)\b[^>]*>/g)].map(m=>m[0]);
  assert(fields.length>=3);
  assert(fields.filter(tag=>!/type="radio"/.test(tag)).every(tag=>/\bdisabled\b/.test(tag)), `Panel ${n} contains active answer controls`);
  if(fields.some(tag=>/type="radio"/.test(tag))) assert.match(panel,/<fieldset disabled/);
}
assert.match(listeningHTML,/UI PREVIEW · NOT AN ACTIVE TEST/);
assert.match(listeningHTML,/Audio playback is not connected yet/);
assert.match(style,/.listening-sample-script summary:focus-visible/);
assert.doesNotMatch(listeningJS,/\b(fetch|request|MediaRecorder|Audio|setInterval|setTimeout)\s*\(/);
new vm.Script(listeningJS);
const copy={window:{}};
vm.runInNewContext(read('site-copy.js'),copy);
for (const key of ['Read an illustrative script (text-only preview)','This sample script is not an audio recording.']) {
  assert(copy.window.eaglesCopy[key]?.every(Boolean),`Missing RU/UZ for ${key}`);
}

const speaking=read('project.js');
const begin=speaking.indexOf('let questions1 ='), end=speaking.indexOf('let used1 =',begin);
assert(begin>=0 && end>begin,'Speaking bank not found');
const bank={};
vm.runInNewContext(speaking.slice(begin,end).replaceAll(/let questions(\d) =/g,'var questions$1 ='),bank);
const promptLocale={window:{}};
vm.runInNewContext(read('practice-copy.js'),promptLocale);
let speakingTotal=0;
for (let part=1;part<=3;part++) {
  const questions=Array.from(bank[`questions${part}`]);
  speakingTotal+=questions.length;
  assert(questions.length>100,`Speaking part ${part} lost questions`);
  assert.equal(new Set(questions).size,questions.length,`Speaking part ${part} still repeats prompts`);
  for (const q of questions) {
    assert(promptLocale.window.eaglesPrompts?.[q]?.every(Boolean),`No Speaking translation for ${q}`);
  }
}
assert.match(speaking,/window\.eaglesPrompts\?\.\[question\]\?\.\[column\]/);
new vm.Script(speaking);
console.log(`Content v1.5.4 PASS — ${builtIns.size} Reading samples (${[...builtIns].reduce((sum,[,t])=>sum+t.count,0)} questions), 4 Listening previews, ${speakingTotal} unique Speaking prompts with RU/UZ translations`);
