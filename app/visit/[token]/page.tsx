import { VisitPageClient } from "./visit-client"
import { readVisitToken } from "@/lib/visit-token"
import { getAdminClient } from "@/lib/supabase/server"
import { getBrandingSettings } from "@/lib/branding"
import { getTrainingClearance } from "@/lib/training-clearance"
import { rateLimit } from "@/lib/rate-limit"
import { visitorFullName } from "@/lib/visit-page"

export const dynamic = "force-dynamic"

export default async function VisitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limited = rateLimit(`visit-page:${token.slice(0, 24)}`, 60, 10 * 60 * 1000)
  if (!limited.allowed) {
    return <VisitError title="Please wait" body="Too many requests. Try again in a few minutes." />
  }

  const read = readVisitToken(token)
  if (!read.ok) {
    return (
      <VisitError
        title={read.reason === "expired" ? "This visit link has expired" : "This visit link is not valid"}
        body="Ask reception if you still need the visit details."
      />
    )
  }

  const admin = getAdminClient()
  const { data: signIn } = await admin
    .from("sign_ins")
    .select(
      "id, sign_in_time, sign_out_time, badge_number, purpose, photo_url, visitor_id, host_id, location_id, visitor_type_id, visitor:visitors(first_name, last_name, email, company, photo_url), host:hosts(name, email), visitor_type:visitor_types(name), location:locations(name, timezone)",
    )
    .eq("id", read.payload.signInId)
    .maybeSingle()

  if (!signIn) {
    return <VisitError title="Visit not found" body="This visit is no longer available." />
  }

  const visitor = unwrap(signIn.visitor)
  const host = unwrap(signIn.host)
  const visitorType = unwrap(signIn.visitor_type)
  const location = unwrap(signIn.location)
  const branding = await getBrandingSettings()
  const clearance = signIn.visitor_type_id && visitor?.email
    ? await getTrainingClearance(admin, visitor.email, signIn.visitor_type_id)
    : null

  const signedOut = Boolean(signIn.sign_out_time)
  const visitorName = visitorFullName(visitor?.first_name, visitor?.last_name)

  return (
    <VisitPageClient
      token={token}
      visitorName={visitorName}
      hostName={host?.name || "Host"}
      company={visitor?.company || ""}
      visitorType={visitorType?.name || ""}
      siteName={location?.name || ""}
      timezone={location?.timezone || "UTC"}
      arrivalTime={signIn.sign_in_time}
      signedOutAt={signIn.sign_out_time}
      badgeNumber={signIn.badge_number || ""}
      purpose={signIn.purpose || ""}
      photoUrl={signIn.photo_url || visitor?.photo_url || ""}
      trainingDone={clearance?.cleared === true}
      trainingMessage={clearance?.message || null}
      companyName={branding.companyName}
      logoUrl={branding.companyLogo || null}
      signedOut={signedOut}
      expiresAt={read.expiresAt}
    />
  )
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

function VisitError({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="v2-card max-w-md p-6">
        <h1 className="text-24 font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">{body}</p>
      </div>
    </main>
  )
}
