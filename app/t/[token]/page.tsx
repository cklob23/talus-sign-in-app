import { TrainingLinkClient } from "./training-link-client"
import { readTrainingLinkToken } from "@/lib/visit-token"
import { getAdminClient } from "@/lib/supabase/server"
import { getBrandingSettings } from "@/lib/branding"
import { getTrainingClearance } from "@/lib/training-clearance"
import { rateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export default async function TrainingLinkPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const limited = rateLimit(`training-link-page:${token.slice(0, 24)}`, 60, 10 * 60 * 1000)
  if (!limited.allowed) {
    return <ErrorState title="Please wait" body="Too many requests. Try again in a few minutes." />
  }

  const read = readTrainingLinkToken(token)
  if (!read.ok) {
    return (
      <ErrorState
        title={read.reason === "expired" ? "This link has expired" : "This link is not valid"}
        body="Ask your host to send a new training link."
      />
    )
  }

  const admin = getAdminClient()
  const hostLookup = read.payload.hostId
    ? admin.from("hosts").select("name").eq("id", read.payload.hostId).maybeSingle()
    : Promise.resolve({ data: null as { name?: string } | null })
  const [{ data: visitorType }, { data: location }, branding, { data: host }] = await Promise.all([
    admin
      .from("visitor_types")
      .select("id, name, training_title, training_video_url, requires_training")
      .eq("id", read.payload.visitorTypeId)
      .maybeSingle(),
    admin.from("locations").select("id, name").eq("id", read.payload.locationId).maybeSingle(),
    getBrandingSettings(),
    hostLookup,
  ])

  if (!visitorType?.requires_training || !visitorType.training_video_url) {
    return <ErrorState title="No training video" body="This visitor type does not have a safety video." />
  }

  const clearance = await getTrainingClearance(admin, read.payload.email, visitorType.id)

  return (
    <TrainingLinkClient
      token={token}
      firstName={read.payload.firstName}
      lastName={read.payload.lastName}
      email={read.payload.email}
      hostName={host?.name || read.payload.hostName || ""}
      videoTitle={visitorType.training_title || "Safety training"}
      videoUrl={visitorType.training_video_url}
      siteName={location?.name || "Talus Ag"}
      companyName={branding.companyName}
      logoUrl={branding.companyLogo || null}
      alreadyCleared={clearance.cleared}
      clearanceMessage={clearance.message}
      clearanceMessageEs={clearance.messageEs}
    />
  )
}

function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="v2-card max-w-md p-6">
        <h1 className="text-24 font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-muted-foreground">{body}</p>
      </div>
    </main>
  )
}
