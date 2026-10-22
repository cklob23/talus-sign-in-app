import { PreviewUiScreens } from "./preview-client"

export const dynamic = "force-dynamic"

export default async function PreviewUiPage({
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
      <style>{`nextjs-portal { display: none !important; } html, body, button, input, select, textarea { font-family: Arial, Helvetica, sans-serif !important; letter-spacing: 0 !important; }`}</style>
      <PreviewUiScreens screen={params.screen} full={params.full === "1"} />
    </>
  )
}
