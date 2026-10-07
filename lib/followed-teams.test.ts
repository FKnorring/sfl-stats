import assert from "node:assert/strict"
import { test } from "node:test"
import {
  emptyPreferences,
  migrateCookie,
  parsePreferences,
  refreshTeamIds,
  setFavorite,
  toggleFollow,
  currentTeam,
  followHref,
} from "./followed-teams"
import { createFollowStore } from "./follow-store"

const teams = [
  { teamId: 1, teamName: "Alpha" },
  { teamId: 2, teamName: "Beta" },
]

test("first follow, favorite replacement, removals and colors maintain invariants", () => {
  let state = toggleFollow(emptyPreferences(), teams[0])
  assert.equal(state.favorite, "Alpha")
  state = toggleFollow(state, teams[1])
  state = setFavorite(state, "Beta")
  assert.equal(state.favorite, "Beta")
  state = toggleFollow(state, teams[0])
  assert.equal(state.follows[0].colorSlot, 1)
  state = toggleFollow(state, teams[0])
  assert.equal(state.follows[0].colorSlot, 1)
  assert.equal(state.follows[1].colorSlot, 2)
  state = toggleFollow(state, teams[1])
  assert.equal(state.favorite, "Alpha")
  state = toggleFollow(state, teams[0])
  assert.equal(state.favorite, null)
  assert.deepEqual(parsePreferences(JSON.stringify(state)), state)
  assert.throws(() => setFavorite(state, "Unknown"), /Only followed/)
})

test("cookie migration keeps unavailable teams, deduplicates and follows season names", () => {
  const state = migrateCookie('["Alpha","Missing","Alpha","Beta"]', teams)
  assert.deepEqual(
    state.follows.map((f) => f.teamId),
    [1, null, 2]
  )
  const next = refreshTeamIds(setFavorite(state, "Beta"), [
    { teamId: 99, teamName: "Beta" },
  ])
  assert.deepEqual(
    next.follows.map((f) => f.teamId),
    [null, null, 99]
  )
  assert.equal(next.favorite, "Beta")
  assert.equal(next.follows[2].colorSlot, 2)
  assert.equal(
    currentTeam("Alpha", [teams[0], { ...teams[0], teamId: 3 }]),
    null
  )
  assert.equal(followHref("A / B%"), "/follow/A%20%2F%20B%25")
})

test("malformed, unsupported and inconsistent preferences are rejected", () => {
  const good = toggleFollow(emptyPreferences(), teams[0])
  for (const raw of [
    "{",
    '{"version":2}',
    JSON.stringify({ ...good, favorite: "Missing" }),
    JSON.stringify({ ...good, follows: [...good.follows, good.follows[0]] }),
    JSON.stringify({ ...good, follows: [{ ...good.follows[0], teamId: -1 }] }),
    JSON.stringify({ ...good, nextColor: 0 }),
  ])
    assert.throws(() => parsePreferences(raw))
})

test("store migrates only after durable write and does not echo cross-tab updates", () => {
  let value: string | null = null
  let legacy: string | null = '["Alpha","Beta"]'
  let writes = 0
  const access = {
    read: () => value,
    write: (next: string) => {
      value = next
      writes++
    },
    legacy: () => legacy,
    clearLegacy: () => {
      legacy = null
    },
  }
  const store = createFollowStore()
  let notifications = 0
  const unsubscribe = store.subscribe(() => notifications++)
  assert.equal(store.getSnapshot().ready, false)
  store.load(teams, access)
  assert.equal(store.getSnapshot().state.favorite, "Alpha")
  assert.equal(legacy, null)
  store.favorite("Beta")
  const persisted = parsePreferences(value!)
  assert.equal(persisted.favorite, "Beta")
  const before = writes
  store.receive(JSON.stringify(setFavorite(persisted, "Alpha")))
  assert.equal(store.getSnapshot().state.favorite, "Alpha")
  assert.equal(writes, before)
  store.receive(null)
  assert.deepEqual(store.getSnapshot().state.follows, [])
  assert.ok(notifications >= 4)
  unsubscribe()
})

test("valid local storage wins; failed migration keeps cookie and session follows", (t) => {
  t.mock.method(console, "error", () => {})
  const state = toggleFollow(emptyPreferences(), teams[1])
  const existing = createFollowStore()
  existing.load(teams, {
    read: () => JSON.stringify(state),
    write: () => {},
    legacy: () => {
      throw new Error("must not read cookie")
    },
    clearLegacy: () => {},
  })
  assert.equal(existing.getSnapshot().state.favorite, "Beta")
  let cleared = false
  const failing = createFollowStore()
  failing.load(teams, {
    read: () => null,
    write: () => {
      throw new Error("quota")
    },
    legacy: () => '["Alpha"]',
    clearLegacy: () => {
      cleared = true
    },
  })
  assert.equal(cleared, false)
  assert.equal(failing.getSnapshot().state.favorite, "Alpha")
  assert.match(failing.getSnapshot().warning!, /only for this visit/)
  failing.toggle(teams[1])
  failing.load(teams, {
    read: () => null,
    write: () => {},
    legacy: () => null,
    clearLegacy: () => {},
  })
  assert.equal(failing.getSnapshot().state.follows.length, 2)
})

test("invalid saved state is preserved until explicit reset, including cross-tab data", (t) => {
  t.mock.method(console, "error", () => {})
  let value = '{"version":99}'
  const store = createFollowStore()
  store.load(teams, {
    read: () => value,
    write: (next) => {
      value = next
    },
    legacy: () => null,
    clearLegacy: () => {},
  })
  assert.equal(store.getSnapshot().blocked, true)
  store.toggle(teams[0])
  assert.equal(value, '{"version":99}')
  store.reset()
  assert.deepEqual(parsePreferences(value), emptyPreferences())
  store.receive("invalid")
  assert.equal(store.getSnapshot().blocked, true)
})

test("storage-read failures use cookie for this session without deleting it", (t) => {
  t.mock.method(console, "error", () => {})
  const store = createFollowStore()
  store.load(teams, {
    read: () => {
      throw new Error("disabled")
    },
    write: () => {
      throw new Error("disabled")
    },
    legacy: () => '["Alpha"]',
    clearLegacy: () => {
      throw new Error("must not delete")
    },
  })
  assert.equal(store.getSnapshot().state.favorite, "Alpha")
  assert.match(store.getSnapshot().warning!, /unavailable/)
  store.load([{ teamId: 45, teamName: "Alpha" }], {
    read: () => {
      throw new Error("disabled")
    },
    write: () => {
      throw new Error("disabled")
    },
    legacy: () => null,
    clearLegacy: () => {},
  })
  assert.equal(store.getSnapshot().state.follows[0].teamId, 45)
  assert.equal(store.getSnapshot().state.favorite, "Alpha")
})
