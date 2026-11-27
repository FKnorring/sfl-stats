import assert from "node:assert/strict"
import { test } from "node:test"
import { currentRoundIndex, parseBracketWidget } from "./toornament/bracket"

function card(
  id: string,
  label: string,
  x: number,
  y: number,
  a: [string, number | null, string?],
  b: [string, number | null, string?],
  state = ""
) {
  const opp = (
    n: number,
    [name, score, cls]: [string, number | null, string?]
  ) =>
    `<div class="opponent opponent-${n}"><div class="logo"><img src="/media/${id}${n}"></div><div class="name ${cls ?? ""}">${name}</div>${score === null ? "" : `<div class="result ${cls ?? ""}">${score}</div>`}</div>`
  return `<div style="position: absolute; left: ${x}rem; top: ${y}rem; width: 12rem; height: 4rem;"><div class="match format-mini" data-type="match" data-id="${id}"><div class="header"><div class="name">${label}</div></div><div class="record">${opp(1, a)}${opp(2, b)}</div>${state}</div></div>`
}

const html = `<div class="structure-round"><div class="title">Semi</div></div><div class="structure-round"><div class="title">Final</div></div>
<div class="bracket format-standard" style="width: 26rem; height: 12rem;"><div class="bracket-links"><svg>
<polyline class="link winner" points="12000,2000 12500,2000 12500,5000 13000,5000"></polyline>
<polyline class="link" points="12000,8000 12500,8000 12500,5000 13000,5000"></polyline>
</svg></div><div class="bracket-nodes">
${card("1", "WB 1.1", 0, 0, ["Alpha", 2, "win"], ["Beta", 0, "loss"])}
${card("2", "WB 1.2", 0, 6, ["Gamma", null], ["Delta", null], `<div class="state"><datetime-view value="2026-12-04T23:00:00+00:00"></datetime-view></div>`)}
${card("3", "WB 2.1", 13, 3, ["Alpha", null], ["", null])}
</div></div>`

test("parseBracketWidget reads rounds, results, links and status", () => {
  const bracket = parseBracketWidget(html)
  assert.ok(bracket)
  assert.deepEqual(bracket.rounds, ["Semi", "Final"])
  assert.equal(bracket.width, 26)
  const [m1, m2, m3] = bracket.matches
  assert.equal(m1.status, "completed")
  assert.equal(m1.teamA.result, "win")
  assert.equal(m1.teamB.score, 0)
  assert.equal(m1.nextMatchId, "3")
  assert.equal(m2.status, "pending")
  assert.equal(m2.scheduledAt, "2026-12-04T23:00:00.000Z")
  assert.equal(m2.nextMatchId, "3")
  assert.equal(m3.status, "waiting")
  assert.equal(m3.teamB.name, null)
  assert.equal([m1, m2, m3].map((m) => m.round).join(), "0,0,1")
  assert.equal(currentRoundIndex(bracket), 0)
})

test("parseBracketWidget returns null for unrecognized markup", () => {
  assert.equal(parseBracketWidget("<html></html>"), null)
})
