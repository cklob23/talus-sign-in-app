import { Suspense } from "react"
import { HistoryContent } from "@/components/admin/history-content"

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-muted-foreground">Loading...</div>}>
      <HistoryContent />
    </Suspense>
  )
}
