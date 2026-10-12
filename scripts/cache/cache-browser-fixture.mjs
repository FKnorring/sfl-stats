import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

// Optional smoke checks using an installed Chromium browser, with no test dependency.
export async function checkCacheNavigation(executable, origin) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "sfl-cache-browser-"))
  const browser = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--no-first-run",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  )
  let socket
  try {
    let port
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(
        browser.exitCode,
        null,
        "Browser exited before opening its debugging port"
      )
      try {
        port = (
          await readFile(path.join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n")[0]
        break
      } catch (error) {
        if (error.code !== "ENOENT") throw error
        await sleep(100)
      }
    }
    assert.ok(port, "Browser did not open its debugging port")
    const target = await (
      await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
        method: "PUT",
      })
    ).json()
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await once(socket, "open")
    let id = 0
    const pending = new Map()
    const errors = []
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data)
      if (message.method === "Runtime.exceptionThrown")
        errors.push(
          message.params.exceptionDetails.exception?.description ??
            message.params.exceptionDetails.text
        )
      if (message.id) {
        const callback = pending.get(message.id)
        if (!callback) return
        pending.delete(message.id)
        if (message.error) callback.reject(new Error(message.error.message))
        else callback.resolve(message.result)
      }
    })
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const requestId = ++id
        pending.set(requestId, { resolve, reject })
        socket.send(JSON.stringify({ id: requestId, method, params }))
      })
    const evaluate = async (expression) => {
      const response = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      assert.ok(
        !response.exceptionDetails,
        JSON.stringify(response.exceptionDetails)
      )
      return response.result.value
    }
    const waitFor = async (expression) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await evaluate(expression)) return
        await sleep(100)
      }
      const state = await evaluate(`({
        url: location.href,
        text: document.body?.innerText.slice(0, 2500),
        links: Array.from(document.querySelectorAll("a")).slice(0, 20).map(el => el.getAttribute("href"))
      })`)
      assert.fail(
        `Browser did not reach: ${expression}; ${JSON.stringify({ ...state, errors })}`
      )
    }
    await send("Page.enable")
    await send("Runtime.enable")
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("sfl-followed-teams", ${JSON.stringify(
        JSON.stringify({
          version: 1,
          follows: [{ teamId: 1, teamName: "Alpha", colorSlot: 0 }],
          favorite: "Alpha",
          nextColor: 1,
        })
      )})`,
    })
    await send("Page.navigate", { url: `${origin}/followed` })
    await waitFor(`!!document.querySelector('a[href="/follow/Alpha"]')`)
    await waitFor(`!!document.querySelector('a[href="/leaderboard"]')`)
    await evaluate("window.__cacheSmokeDocument = true")
    await evaluate(`document.querySelector('a[href="/leaderboard"]').click()`)
    await waitFor(
      `location.pathname === "/leaderboard" && !!document.querySelector("table")`
    )
    assert.equal(
      await evaluate("window.__cacheSmokeDocument"),
      true,
      "Link navigation must preserve the hydrated document"
    )
    await waitFor(`!!document.querySelector('[data-slot="select-trigger"]')`)
    await evaluate(
      `document.querySelector('[data-slot="select-trigger"]').click()`
    )
    await waitFor(
      `Array.from(document.querySelectorAll('[role="option"]')).some(el => el.textContent.includes("SFL Rating"))`
    )
    await evaluate(
      `Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.includes("SFL Rating")).click()`
    )
    await waitFor(
      `new URLSearchParams(location.search).get("stat") === "rating" && document.querySelector("table")?.textContent.includes("SFL Rating")`
    )
    await evaluate(`document.querySelector('a[href="/teams"]').click()`)
    await waitFor(
      `location.pathname === "/teams/Division%201" && !!document.querySelector('a[href="/teams/team/Alpha"]')`
    )
    await evaluate(
      `document.querySelector('[data-slot="select-trigger"]').click()`
    )
    await waitFor(
      `Array.from(document.querySelectorAll('[role="option"]')).some(el => el.textContent.includes("SFL Säsong 9"))`
    )
    await evaluate(
      `Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.includes("SFL Säsong 9")).click()`
    )
    await waitFor(
      `new URLSearchParams(location.search).get("season") === "SFL Säsong 9"`
    )
    await evaluate(
      `Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent === "Division 2").click()`
    )
    await waitFor(
      `location.pathname === "/teams/Division%202" && !!document.querySelector('a[href="/teams/team/Team%2012"]')`
    )
    assert.equal(
      await evaluate(`new URLSearchParams(location.search).get("season")`),
      "SFL Säsong 9"
    )
    assert.equal(
      await evaluate(`new URLSearchParams(location.search).has("division")`),
      false
    )
    await evaluate(
      `Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent === "Division 1").click()`
    )
    await waitFor(
      `location.pathname === "/teams/Division%201" && !!document.querySelector('a[href="/teams/team/Alpha"]')`
    )
    await evaluate(
      `document.querySelector('a[href="/teams/team/Alpha"]').click()`
    )
    await waitFor(
      `location.pathname === "/teams/team/Alpha" && document.querySelector("table")?.textContent.includes("Player")`
    )
    await evaluate(`document.querySelector('a[href="/followed"]').click()`)
    await waitFor(
      `location.pathname === "/followed" && !!document.querySelector('a[href="/follow/Alpha"]')`
    )
    await evaluate(`document.querySelector('a[href="/follow/Alpha"]').click()`)
    await waitFor(
      `location.pathname === "/follow/Alpha" && document.body?.textContent.includes("Upcoming matches") && !!document.querySelector("table")`
    )
    assert.equal(
      await evaluate(
        `JSON.parse(localStorage.getItem("sfl-followed-teams")).favorite`
      ),
      "Alpha"
    )
    assert.equal(await evaluate("window.__cacheSmokeDocument"), true)
    await send("Page.navigate", { url: `${origin}/players/missing` })
    await waitFor(
      `document.body?.textContent.includes("404") && document.body?.textContent.includes("could not be found")`
    )
    assert.deepEqual(
      errors,
      [],
      "Navigation/hydration must not throw browser errors"
    )
  } finally {
    socket?.close()
    if (browser.exitCode === null) {
      browser.kill()
      await once(browser, "exit")
    }
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
}
