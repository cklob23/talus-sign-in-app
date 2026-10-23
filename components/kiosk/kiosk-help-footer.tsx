import { IT_SUPPORT } from "@/lib/it-support"

/** Contact line for locked and unlocked kiosk shells. */
export function KioskHelpFooter({
  lead = "Need help? Contact IT Support at",
}: {
  lead?: string
}) {
  return (
    <footer className="mt-auto border-t border-border">
      <p className="px-4 py-4 text-center text-13 leading-relaxed text-muted-foreground">
        {lead}{" "}
        <a
          href={`mailto:${IT_SUPPORT}`}
          className="font-medium text-primary-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {IT_SUPPORT}
        </a>
      </p>
    </footer>
  )
}
