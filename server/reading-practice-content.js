"use strict";
// Original Eagles Team practice material. These in-code samples are published
// without writing documents to Firestore. Existing saved attempts are snapshots.
const starter = require("./reading-starter");

const passages = {
  "cooling-streets": {
    title: "Cooling a walk through the city", mode: "practice", minutes: 12,
    status: "published", owner: "system", version: 1, count: 9,
    sections: [{
      heading: "Cooling a walk through the city",
      passage: `In the town of Lanton, the council wanted to find out whether temporary shade could make a route from the station to the public library more comfortable. Three streets of similar width were chosen. On Pine Street, staff placed twelve large containers holding young trees. On Elm Street, they stretched a fabric canopy between existing supports. Market Street was left unchanged, providing a comparison with the two shaded streets. The council described the project as a trial, not as proof that one method would work everywhere.

For six weeks in late summer, volunteers visited each street at 12:30 p.m. and 4:30 p.m. They measured the temperature of the pavement using an infrared thermometer and counted people walking past a fixed point. The same thermometer was checked before every set of measurements. Rainy days were excluded from the temperature averages because moisture could change the surface readings. The team recorded neither the age of pedestrians nor their reason for choosing a particular street.

At midday, the pavement below the fabric canopy was, on average, six degrees Celsius cooler than the pavement on Market Street. The containers of young trees were associated with a smaller difference of two degrees. In the late afternoon the gaps narrowed. Walking counts rose on Elm Street during the trial, but the volunteers warned against a simple explanation: a local festival had also attracted visitors to the area.

The council did not consider the tree experiment a failure. Young trees might provide much more shade as their crowns widened, although watering and maintaining the containers would require staff time. A fabric canopy could provide shade immediately, but workers would need to remove it before strong winds and store it during winter. Rather than commit to a permanent scheme, the council decided to observe the streets for another summer and then compare both the costs and the temperatures.`,
      questions: [
        {type: "multiple", prompt: "Why was Market Street left unchanged?", options: ["To provide a comparison", "To test a different tree species", "To measure indoor conditions", "To avoid counting pedestrians"], keys: ["To provide a comparison"]},
        {type: "truth", prompt: "Volunteers measured the pavement twice each day.", options: ["True", "False", "Not Given"], keys: ["True"]},
        {type: "truth", prompt: "Measurements taken on rainy days were included in the temperature averages.", options: ["True", "False", "Not Given"], keys: ["False"]},
        {type: "truth", prompt: "All the volunteers had worked on previous council projects.", options: ["True", "False", "Not Given"], keys: ["Not Given"]},
        {type: "short", prompt: "What instrument measured the pavement temperature? Write NO MORE THAN TWO WORDS.", options: [], keys: ["infrared thermometer"]},
        {type: "sentence", prompt: "An increase in visitors may also have been linked to a local ____. Write ONE WORD.", options: [], keys: ["festival"]},
        {type: "information", prompt: "Which street was fitted with a fabric canopy?", options: ["Pine Street", "Elm Street", "Market Street"], keys: ["Elm Street"]},
        {type: "multiple", prompt: "Which treatment produced the largest average midday temperature difference?", options: ["The fabric canopy", "The young trees", "The unchanged street", "The winter storage plan"], keys: ["The fabric canopy"]},
        {type: "short", prompt: "What part of the trees might widen in future? Write ONE WORD.", options: [], keys: ["crowns"]}
      ]
    }]
  },
  "library-of-things": {
    title: "A library that lends objects", mode: "practice", minutes: 12,
    status: "published", owner: "system", version: 1, count: 9,
    sections: [{
      heading: "A library that lends objects",
      passage: `A community group in Larkfield noticed that many households bought tools or household objects for a single task and then stored them for years. The group opened a small 'library of things' in an unused railway office. Unlike a book library, it lent objects such as carpet cleaners, drills and camping equipment. Its first collection contained sixty items, nearly half of which had been donated by residents. Members of the public could consult the catalogue without paying anything.

Borrowing required a membership card and a refundable deposit of five pounds. Members could keep an item for up to seven days. The organisers introduced an extra safety briefing for anyone borrowing a powered tool, but this was not necessary for objects such as folding chairs. Volunteers checked each object when it was returned and removed damaged items from circulation until they could be repaired.

The library also ran a monthly repair workshop in a neighbouring community hall. People could bring possessions they already owned, rather than borrow another object. The workshop was supported by trained volunteers, who explained simple repairs but did not promise that everything could be fixed. Staff deliberately kept the workshop separate from the lending desk so that a long repair job would not hold up the borrowing queue.

During the first three months the lending desk recorded 320 loans. The figures could not show how many new purchases had been avoided: a borrower might still have bought a product later. However, in a small questionnaire, several members said that they valued being able to try an unfamiliar object before buying it. The organisers regarded this response as encouraging, while acknowledging that the questionnaire did not represent every borrower.

The group chose to extend the trial for another season. Before buying more equipment, it planned to review which items were requested most often and whether volunteers could continue to handle inspections. The organisers argued that a useful service would depend not only on the number of loans but also on keeping equipment safe and available.`,
      questions: [
        {type: "multiple", prompt: "Why did the community group create the library?", options: ["To share objects needed only occasionally", "To replace the town's book library", "To sell donated equipment", "To offer railway tickets"], keys: ["To share objects needed only occasionally"]},
        {type: "truth", prompt: "The library's initial collection contained sixty items.", options: ["True", "False", "Not Given"], keys: ["True"]},
        {type: "truth", prompt: "All borrowers had to attend a safety briefing before taking any object home.", options: ["True", "False", "Not Given"], keys: ["False"]},
        {type: "truth", prompt: "The lending desk made a financial profit during its first three months.", options: ["True", "False", "Not Given"], keys: ["Not Given"]},
        {type: "short", prompt: "What was the maximum borrowing period? Write NO MORE THAN TWO WORDS.", options: [], keys: ["seven days", "7 days"]},
        {type: "sentence", prompt: "Members paid a refundable ____ of five pounds. Write ONE WORD.", options: [], keys: ["deposit"]},
        {type: "features", prompt: "Who inspected objects when borrowers returned them?", options: ["Volunteers", "Railway staff", "Book publishers"], keys: ["Volunteers"]},
        {type: "summary", prompt: "Some members valued trying a product before ____ it. Write ONE WORD.", options: [], keys: ["buying"]},
        {type: "multiple", prompt: "What did the organisers decide to do after three months?", options: ["Extend the trial for another season", "Replace the repair volunteers", "Close the lending desk permanently", "Sell all donated items"], keys: ["Extend the trial for another season"]}
      ]
    }]
  }
};
const builtIns = new Map([["shade-experiment", starter], ...Object.entries(passages)]);
const getBuiltIn = id => builtIns.get(id) || null;
module.exports = {builtIns, getBuiltIn};
