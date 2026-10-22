import { mkdir, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"

const BASE = process.env.PREVIEW_URL || "http://127.0.0.1:3000"
const OUT = process.env.SCREENSHOT_DIR || "/opt/cursor/artifacts/v2-screens"
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable"

const SCREENS = [
  "kiosk-welcome",
  "kiosk-details",
  "kiosk-training",
  "qr-host",
  "visit",
  "admin-dashboard",
  "admin-visitors",
]
const WIDTHS = [1280, 820, 390]
const THEMES = ["light", "dark"]
const HEIGHT = 900

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let err = ""
    child.stderr.on("data", (chunk) => {
      err += chunk.toString()
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(" ")} failed (${code}): ${err}`))
    })
  })
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/dev/preview-ui?screen=kiosk-welcome&theme=light`)
      if (res.ok) return
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Preview server did not become ready at ${BASE}`)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  await waitForServer()
  const manifest = []
  for (const screen of SCREENS) {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        const file = `${screen.replace(/-/g, "_")}_${width}_${theme}.png`
        const dest = path.join(OUT, file)
        const url = `${BASE}/dev/preview-ui?screen=${screen}&theme=${theme}`
        await run(CHROME, [
          "--headless=new",
          "--disable-gpu",
          "--hide-scrollbars",
          "--no-sandbox",
          "--force-device-scale-factor=1",
          `--window-size=${width},${HEIGHT}`,
          `--screenshot=${dest}`,
          url,
        ])
        manifest.push(file)
        console.log(file)
      }
    }
  }
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
