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
      <style>{`nextjs-portal { display: none !important; }`}</style>
      <PreviewUiScreens screen={params.screen} />
    </>
  )
}
