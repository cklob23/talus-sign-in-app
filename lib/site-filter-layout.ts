/** Tailwind `sm` is 40rem (640px at 16px root). Compare CSS px so a 427px card cannot miss the Select. */
export const SITE_FILTER_SM_PX = 640

export function shouldUseMobileSiteSelect(args: {
  containerWidthPx?: number | null
  viewportWidthPx?: number | null
} = {}): boolean {
  const widths = [args.containerWidthPx, args.viewportWidthPx].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0
  )
  // Mobile-first until measured so the a11y tree cannot show the pill row under sm.
  if (widths.length === 0) return true
  return Math.min(...widths) < SITE_FILTER_SM_PX
}
