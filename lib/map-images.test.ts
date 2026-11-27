import assert from "node:assert/strict"
import { test } from "node:test"
import { getMapIconUrl } from "./maps/map-images"

test("map icon URLs use the available image format for each Netlight pool map", () => {
  assert.equal(getMapIconUrl("de_train"), "/map-icons/de_train.svg")
  assert.equal(getMapIconUrl("de_vertigo"), "/map-icons/de_vertigo.svg")
  assert.equal(getMapIconUrl("de_dust2"), "/map-icons/de_dust2.png")
  assert.equal(getMapIconUrl("de_anubis"), "/map-icons/de_anubis.png")
})
