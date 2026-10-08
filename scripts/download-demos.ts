import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { createClient } from "@libsql/client"

const ROOT_FOLDER =
  "/sites/Publiclir/Delade dokument/Svenska Företagsligan/SFL S09 - ALL/SFL09_DEMOS"
const SHAREPOINT_URL =
  "https://djsesport.sharepoint.com/:f:/s/Publiclir/IgDdUc4fjbExRYkPZKruj0O4Aau0nwBLFEtiyf6ScQ4GVDg?e=9UMucy"

type DemoFile = {
  name: string
  path: string
  bytes: number
}

type Download = {
  guid: string
  state: "inProgress" | "completed" | "canceled"
}

type CdpResponse = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { message: string }
}

function getBrowserPath(): string {
  const candidates = [
    process.env.EDGE_PATH,
    process.env.ProgramFiles &&
      path.join(
        process.env.ProgramFiles,
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe"
      ),
    process.env["ProgramFiles(x86)"] &&
      path.join(
        process.env["ProgramFiles(x86)"],
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe"
      ),
  ].filter((candidate): candidate is string => Boolean(candidate))
  const browser = candidates.find((candidate) => fs.existsSync(candidate))
  if (!browser) {
    throw new Error(
      "Microsoft Edge was not found. Install Edge or set EDGE_PATH."
    )
  }
  return browser
}

async function waitForDebugEndpoint(port: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        const version = (await response.json()) as {
          webSocketDebuggerUrl: string
        }
        return version.webSocketDebuggerUrl
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error("Edge did not start its DevTools endpoint.")
}

function createCdpClient(socket: WebSocket) {
  let nextId = 0
  const pending = new Map<
    number,
    { resolve: (value: CdpResponse) => void; reject: (error: Error) => void }
  >()
  const downloads = new Map<string, Download>()
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as CdpResponse
    if (message.id !== undefined) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message)
    }
    if (message.method === "Browser.downloadWillBegin") {
      const params = message.params as {
        guid: string
        suggestedFilename: string
      }
      downloads.set(params.suggestedFilename, {
        guid: params.guid,
        state: "inProgress",
      })
    }
    if (message.method === "Browser.downloadProgress") {
      const params = message.params as {
        guid: string
        state: Download["state"]
      }
      for (const [name, download] of downloads) {
        if (download.guid === params.guid) {
          downloads.set(name, { ...download, state: params.state })
          break
        }
      }
    }
  })

  function send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<CdpResponse> {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }

  return { send, downloads }
}

async function evaluate<T>(
  send: ReturnType<typeof createCdpClient>["send"],
  sessionId: string,
  expression: string,
  awaitPromise = false
): Promise<T> {
  const response = await send(
    "Runtime.evaluate",
    { expression, awaitPromise, returnByValue: true },
    sessionId
  )
  const result = response.result?.result as
    { type?: string; value?: T; description?: string } | undefined
  const exception = response.result?.exceptionDetails as
    { text?: string } | undefined
  if (exception) throw new Error(exception.text ?? "SharePoint request failed.")
  if (result?.type === "undefined") return undefined as T
  if (!result || !("value" in result)) {
    throw new Error(result?.description ?? "Browser returned no result.")
  }
  return result.value as T
}

function getDemosExpression(): string {
  return `(() => {
    const root = ${JSON.stringify(ROOT_FOLDER)};
    const query = async (folder, kind) => {
      const path = folder.replaceAll("'", "''");
      const url = "/sites/Publiclir/_api/web/GetFolderByServerRelativeUrl('" +
        path + "')/" + kind + "?$top=5000&$select=Name,ServerRelativeUrl,Length";
      const response = await fetch(url, {
        headers: { Accept: "application/json;odata=nometadata" }
      });
      if (!response.ok) throw new Error(kind + " request failed: " + response.status);
      return (await response.json()).value || [];
    };
    return (async () => {
      const demos = [];
      const walk = async (folder) => {
        const [files, folders] = await Promise.all([
          query(folder, "Files"),
          query(folder, "Folders")
        ]);
        demos.push(...files
          .filter(file => file.Name.toLowerCase().endsWith(".dem"))
          .map(file => ({
            name: file.Name,
            path: file.ServerRelativeUrl,
            bytes: Number(file.Length)
          })));
        await Promise.all(folders
          .filter(child => child.Name !== "Forms")
          .map(child => walk(child.ServerRelativeUrl)));
      };
      await walk(root);
      return demos;
    })();
  })()`
}

async function waitForDownload(
  downloads: Map<string, Download>,
  fileName: string
): Promise<void> {
  const deadline = Date.now() + 30 * 60 * 1000
  while (Date.now() < deadline) {
    const download = downloads.get(fileName)
    if (download?.state === "completed") return
    if (download?.state === "canceled") {
      throw new Error(`SharePoint canceled the download of ${fileName}.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out downloading ${fileName}.`)
}

async function main() {
  const dirIndex = process.argv.indexOf("--dir")
  const dir = path.resolve(
    dirIndex === -1
      ? (process.env.DEMOS_DIR ?? path.join(process.cwd(), "demos"))
      : (process.argv[dirIndex + 1] ?? "")
  )
  if (dirIndex !== -1 && !process.argv[dirIndex + 1]) {
    throw new Error("--dir requires a value.")
  }
  const dryRun = process.argv.includes("--dry-run")

  const db = createClient({
    url: process.env.DATABASE_URL ?? "file:data/sfl.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-sharepoint-"))
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-demos-"))
  const port = 9300 + Math.floor(Math.random() * 500)
  const browser = spawn(
    getBrowserPath(),
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--remote-debugging-port=${port}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  )
  let socket: WebSocket | undefined
  let cdp: ReturnType<typeof createCdpClient> | undefined

  try {
    const debugUrl = await waitForDebugEndpoint(port)
    const browserSocket = new WebSocket(debugUrl)
    socket = browserSocket
    await new Promise<void>((resolve, reject) => {
      browserSocket.addEventListener("open", () => resolve(), { once: true })
      browserSocket.addEventListener(
        "error",
        () => reject(new Error("Could not connect to Edge DevTools.")),
        { once: true }
      )
    })

    cdp = createCdpClient(browserSocket)
    const target = await cdp.send("Target.createTarget", { url: "about:blank" })
    const targetId = target.result?.targetId as string
    const attached = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    })
    const sessionId = attached.result?.sessionId as string

    await cdp.send("Page.enable", {}, sessionId)
    await cdp.send("Runtime.enable", {}, sessionId)
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: staging,
      eventsEnabled: true,
    })
    await cdp.send("Page.navigate", { url: SHAREPOINT_URL }, sessionId)

    const demos = await evaluate<DemoFile[]>(
      cdp.send,
      sessionId,
      getDemosExpression(),
      true
    )
    const rows = await db.execute("SELECT file_name FROM matches")
    const ingested = new Set(rows.rows.map((row) => String(row.file_name)))
    const pending = demos.filter((demo) => !ingested.has(demo.name))

    console.log(
      `[download-demos] ${demos.length} SharePoint demos; ${pending.length} not ingested.`
    )
    if (dryRun) {
      for (const demo of pending) console.log(`  ${demo.name}`)
      return
    }

    fs.mkdirSync(dir, { recursive: true })

    const expression = (demo: DemoFile) =>
      `(() => {
        const path = ${JSON.stringify(demo.path)}.replaceAll("'", "''");
        const url = "/sites/Publiclir/_api/web/GetFileByServerRelativeUrl('" +
          path + "')/$value";
        const link = document.createElement("a");
        link.href = url;
        link.download = ${JSON.stringify(demo.name)};
        document.body.append(link);
        link.click();
        link.remove();
      })()`

    for (const demo of pending) {
      const destination = path.join(dir, demo.name)
      if (fs.existsSync(destination)) {
        const size = fs.statSync(destination).size
        if (size === demo.bytes) {
          console.log(`[download-demos] already downloaded: ${demo.name}`)
          continue
        }
        throw new Error(
          `${destination} exists but is ${size} bytes; SharePoint reports ${demo.bytes}.`
        )
      }

      cdp.downloads.delete(demo.name)
      console.log(`[download-demos] downloading: ${demo.name}`)
      await evaluate<undefined>(cdp.send, sessionId, expression(demo))
      await waitForDownload(cdp.downloads, demo.name)

      const downloaded = path.join(staging, demo.name)
      const size = fs.statSync(downloaded).size
      if (size !== demo.bytes) {
        throw new Error(
          `${demo.name} downloaded as ${size} bytes; SharePoint reports ${demo.bytes}.`
        )
      }
      fs.renameSync(downloaded, destination)
      console.log(`[download-demos] saved: ${demo.name}`)
    }
  } finally {
    if (cdp) await cdp.send("Browser.close").catch(() => {})
    socket?.close()
    if (browser.exitCode === null) {
      browser.kill()
      await new Promise<void>((resolve) =>
        browser.once("close", () => resolve())
      )
    }
    db.close()
    fs.rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    })
    fs.rmSync(staging, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    })
  }
}

main().catch((error: unknown) => {
  console.error(
    `[download-demos] ${error instanceof Error ? error.message : String(error)}`
  )
  process.exitCode = 1
})
