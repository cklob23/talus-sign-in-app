import { issueTrainingLinkToken } from "@/lib/visit-token"
import { TRAINING_LINK_TTL_MS } from "@/lib/signed-token"
import { normalizeVisitorEmail } from "@/lib/training-clearance"

type AnyClient = {
  from: (table: string) => any
}

export interface CreateTrainingLinkArgs {
  admin: AnyClient
  email: string
  firstName: string
  lastName: string
  company?: string | null
  visitorTypeId: string
  locationId: string
  bookingId?: string | null
  hostId?: string | null
  createdBy?: string | null
  ttlMs?: number
  now?: number
  origin: string
  lang?: "en" | "es"
  audit?: boolean
}

export async function createTrainingLink(args: CreateTrainingLinkArgs): Promise<{
  token: string
  watchUrl: string
  expiresAt: string
}> {
  const email = normalizeVisitorEmail(args.email)
  if (!email) throw new Error("A valid visitor email is required.")
  const now = args.now ?? Date.now()
  const ttlMs = args.ttlMs && args.ttlMs > 0 ? args.ttlMs : TRAINING_LINK_TTL_MS
  const expiresAt = new Date(now + ttlMs).toISOString()
  const lang = args.lang === "es" ? "es" : "en"

  const token = issueTrainingLinkToken({
    payload: {
      email,
      firstName: args.firstName,
      lastName: args.lastName,
      visitorTypeId: args.visitorTypeId,
      locationId: args.locationId,
      bookingId: args.bookingId || null,
      hostId: args.hostId || null,
    },
    now,
    ttlMs,
  })

  const origin = args.origin.replace(/\/+$/, "")
  const watchUrl = `${origin}/t/${encodeURIComponent(token)}${lang === "es" ? "?lang=es" : ""}`

  await args.admin.from("training_link_sends").insert({
    visitor_email: email,
    visitor_first_name: args.firstName,
    visitor_last_name: args.lastName,
    visitor_company: args.company || null,
    visitor_type_id: args.visitorTypeId,
    location_id: args.locationId,
    booking_id: args.bookingId || null,
    host_id: args.hostId || null,
    created_by: args.createdBy || null,
    expires_at: expiresAt,
  })

  if (args.audit !== false) {
    await args.admin.from("audit_logs").insert({
      user_id: args.createdBy || null,
      action: "visitor.training_link_sent",
      entity_type: "visitor",
      entity_id: args.bookingId || null,
      description: `Training link sent to ${email}`,
      metadata: {
        email,
        visitor_type_id: args.visitorTypeId,
        location_id: args.locationId,
        booking_id: args.bookingId || null,
        source: "training_link",
      },
    })
  }

  return { token, watchUrl, expiresAt }
}
