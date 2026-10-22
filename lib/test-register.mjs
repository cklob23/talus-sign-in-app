import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath } from "node:url"

const root = new URL("../", import.meta.url)

const ROUTE_MOCKS = {
  "@/lib/supabase/server": new URL("./test-mocks/supabase-server.ts", import.meta.url).href,
  "@/lib/kiosk-auth": new URL("./test-mocks/kiosk-auth.ts", import.meta.url).href,
  "@/lib/host-notify-send": new URL("./test-mocks/host-notify-send.ts", import.meta.url).href,
}

function resolveWorkspaceSpecifier(specifier) {
  const relative = specifier.startsWith("@/") ? specifier.slice(2) : specifier
  const base = new URL(relative, root)
  const candidates = [
    `${base.href}.ts`,
    `${base.href}.tsx`,
    `${base.href}.js`,
    `${base.href}/index.ts`,
    base.href,
  ]
  for (const href of candidates) {
    try {
      if (existsSync(fileURLToPath(href))) return href
    } catch {
      // ignore invalid file URLs
    }
  }
  return `${base.href}.ts`
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (process.env.KIOSK_ROUTE_TEST_MOCKS && ROUTE_MOCKS[specifier]) {
      return nextResolve(ROUTE_MOCKS[specifier], context)
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(resolveWorkspaceSpecifier(specifier), context)
    }
    return nextResolve(specifier, context)
  },
})
