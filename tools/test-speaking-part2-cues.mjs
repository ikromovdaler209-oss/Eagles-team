import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/project.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/speaking-recording.css", import.meta.url), "utf8");
const start = source.indexOf("let questions2 = ");
const end = source.indexOf("\nlet questions3 = ", start);
const showStart = source.indexOf("function showPrompt(");
const showEnd = source.indexOf("//Speaking", showStart);
assert(start !== -1 && end > start && showStart !== -1 && showEnd > showStart);
const context = vm.createContext({});
const { questions2, part2CuePoints } = vm.runInContext(
  `${source.slice(start, end)}\n({ questions2, part2CuePoints })`, context);
assert.equal(questions2.length, 149, "Keep the full approved Part 2 question bank");
assert.equal(Object.keys(part2CuePoints).length, new Set(questions2).size);
for (const question of questions2) {
  assert(Object.hasOwn(part2CuePoints, question), `Missing cue card for ${question}`);
  const points = part2CuePoints[question];
  assert.equal(points.length, 4, `Cue card must have 4 bullet points: ${question}`);
  for (const point of points) {
    assert(point.length > 9 && !/^(what|when|where|who|why)\??$/i.test(point), `Generic or empty cue: ${question}`);
    assert(!/[<>]/.test(point), `HTML is not expected in cue points: ${question}`);
  }
  assert(/^and explain /i.test(points[3]), `Missing IELTS-style follow-up prompt: ${question}`);
}

class Node {
  constructor(tagName) {
    this.tagName=tagName;
    this.children=[];
    this.textContent="";
    this.lang="";
    this.className="";
    this.classes=new Set();
    this.classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};
  }
  replaceChildren(...items){this.children=items;}
  append(...items){this.children.push(...items);}
}
const box = new Node("div");
const document = {documentElement:{lang:"en"},createElement:tag=>new Node(tag)};
const window = {eaglesPrompts:{[questions2[0]]:["Русский перевод", "O‘zbek tarjima"]}};
const {showPrompt} = vm.runInNewContext(
  `${source.slice(showStart,showEnd)}\n({showPrompt})`, {document,window});
showPrompt(box,questions2[0],part2CuePoints[questions2[0]]);
assert.equal(box.children.length,3,"Prompt + title + list");
assert.equal(box.children[0].textContent,questions2[0]);
assert.equal(box.children[1].textContent,"You should say:");
assert.equal(box.children[2].children.length,4);
assert(box.classes.has("is-part2-cue"));
document.documentElement.lang="ru";
showPrompt(box,questions2[0],part2CuePoints[questions2[0]]);
assert.equal(box.children.length,4,"RU translation stays visible with cue card");
assert.equal(box.children[1].textContent,"Русский перевод");
document.documentElement.lang="uz";
showPrompt(box,questions2[0],part2CuePoints[questions2[0]]);
assert.equal(box.children[1].textContent,"O‘zbek tarjima");
document.documentElement.lang="en";
showPrompt(box,"What is your favourite colour?");
assert.equal(box.children.length,1,"Part 1 stays question-only");
assert(!box.classes.has("is-part2-cue"));
showPrompt(box,"Why do people travel abroad?");
assert.equal(box.children.length,1,"Part 3 stays question-only");
assert(/\.part2-cue-list/.test(css) && /\.part2-cue-title/.test(css));
assert(source.includes('part2CuePoints[questions2[random2]]'));
console.log(`Speaking Part 2 cues PASS: ${questions2.length} question entries, ${Object.keys(part2CuePoints).length} unique cue cards, EN/RU/UZ, Part 1/3 isolation`);
