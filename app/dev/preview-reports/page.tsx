import { PreviewReportsScreens } from "./preview-client"

export const dynamic = "force-dynamic"

export default async function PreviewReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>
}) {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="p-8">
        <p>Preview screens are not available in production.</p>
      </main>
    )
  }
  const params = await searchParams
  return (
    <>
      <style>{`nextjs-portal { display: none !important; } html, body, * { font-family: "Liberation Sans", "DejaVu Sans", Inter, sans-serif !important; letter-spacing: 0 !important; }`}</style>
      <PreviewReportsScreens screen={params.screen} />
    </>
  )
}
