import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const globalsPath = join(dirname(fileURLToPath(import.meta.url)), "../app/globals.css")

const TOKEN_HEX: Record<string, string[]> = {
  "--lp-primary": ["#00854c"],
  "--lp-primary-hover": ["#00703f"],
  "--lp-on-primary": ["#ffffff", "#fff"],
  "--lp-primary-text": ["#00703f"],
  "--lp-accent-soft": ["#e2f4e9"],
  "--lp-focus": ["#0a5c36"],
  "--lp-bg": ["#f5f8f6"],
  "--lp-surface": ["#ffffff", "#fff"],
  "--lp-border": ["#dce6df"],
}

function hasToken(css: string, token: string, hexes: string[]) {
  return hexes.some((hex) => css.toLowerCase().includes(`${token}:${hex}`.toLowerCase()))
}

describe("landing CSS tokens", () => {
  it("emits .landing-page and --lp-* definitions from the theme pipeline", async () => {
    const css = readFileSync(globalsPath, "utf8")
    const result = await postcss([tailwind({ optimize: true })]).process(css, {
      from: globalsPath,
    })
    const out = result.css.replace(/\s+/g, "")

    assert.match(out, /\.landing-page/)
    assert.match(out, /:root(?:,:host)?\{[^}]*--lp-primary:#00854c/i)

    for (const [token, hexes] of Object.entries(TOKEN_HEX)) {
      assert.ok(hasToken(out, token, hexes), `expected optimized CSS to define ${token}`)
    }
  })

  it("stays light unless .dark is set — does not follow prefers-color-scheme", async () => {
    const css = readFileSync(globalsPath, "utf8")
    const result = await postcss([tailwind({ optimize: true })]).process(css, {
      from: globalsPath,
    })
    const out = result.css.replace(/\s+/g, "")

    assert.doesNotMatch(
      out,
      /prefers-color-scheme:dark[^{]*\{[^}]*\.landing-page/,
      "landing must not switch tokens from OS dark mode",
    )
    assert.doesNotMatch(
      css,
      /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[\s\S]*\.landing-page/,
      "source must not pair landing tokens with prefers-color-scheme",
    )
    // optimize:true strips whitespace, so ".dark .landing-page" becomes ".dark.landing-page"
    assert.match(out, /\.dark\.landing-page\{[^}]*--lp-bg:#0a110d/i)
    assert.match(out, /\.landing-page\{[^}]*--lp-bg:#f5f8f6/i)
  })

  it("emits readable dark landing text tokens with AA hover fill", async () => {
    const css = readFileSync(globalsPath, "utf8")
    const result = await postcss([tailwind({ optimize: true })]).process(css, {
      from: globalsPath,
    })
    const out = result.css.replace(/\s+/g, "")

    assert.match(out, /\.dark\.landing-page\{[^}]*--lp-text:#e8efea/i)
    assert.match(out, /\.dark\.landing-page\{[^}]*--lp-muted:#a0afa5/i)
    assert.match(out, /\.dark\.landing-page\{[^}]*--lp-primary-text:#4fd68f/i)
    assert.match(out, /\.dark\.landing-page\{[^}]*--lp-primary-hover:#00703f/i)
    assert.match(out, /\.dark\.landing-page\{[^}]*background-color:var\(--lp-bg\)/i)
    assert.match(out, /\.dark\.landing-page\{[^}]*color:var\(--lp-text\)/i)
    assert.doesNotMatch(out, /--lp-primary-hover:#009656/i)
    assert.doesNotMatch(out, /--primary-hover:#009656/i)
  })
})
