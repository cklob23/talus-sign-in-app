const receptionist = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "receptionist@talusag.com",
  name: "Reception Desk",
  role: "staff",
  loginAt: "2026-10-21T12:00:00.000Z",
}

export function kioskUnauthorized(message = "Unauthorized") {
  return Response.json({ error: message }, { status: 401 })
}

export async function requireKioskContext() {
  return {
    ok: true as const,
    context: { source: "receptionist" as const, session: receptionist },
  }
}

export async function requireKioskContextOrHide() {
  return requireKioskContext()
}
