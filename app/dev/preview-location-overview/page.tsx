import { PreviewLocationOverview } from "./preview-client"

export const dynamic = "force-dynamic"

export default function PreviewLocationOverviewPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="p-8">
        <p>Preview screens are not available in production.</p>
      </main>
    )
  }
  return <PreviewLocationOverview />
}
