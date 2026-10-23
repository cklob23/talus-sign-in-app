import type { VisitorCopy } from "@/lib/visitor-i18n"

/** Ordered visitor-flow step labels. Training is omitted when the type does not need it. */
export function kioskStepperLabels(copy: Pick<VisitorCopy, "you" | "details" | "safety" | "photo">, includeTraining: boolean): string[] {
  return includeTraining
    ? [copy.you, copy.details, copy.safety, copy.photo]
    : [copy.you, copy.details, copy.photo]
}

/**
 * Labels next to the numbered circles only fit on wider layouts.
 * Narrow viewports show the numbers alone so they are not truncated to "Y…".
 */
export const KIOSK_STEPPER_LABEL_BREAKPOINT = "md" as const
