export type KioskBootScreen = "loading" | "login" | "app"

/**
 * Until the receptionist session fetch finishes, /kiosk must not flash
 * the login screen. Login is only for a resolved "no session" result.
 */
export function kioskBootScreen(input: {
  sessionChecked: boolean
  hasSession: boolean
}): KioskBootScreen {
  if (!input.sessionChecked) return "loading"
  return input.hasSession ? "app" : "login"
}
