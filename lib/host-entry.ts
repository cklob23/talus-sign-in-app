export type HostEntrySource = "qr" | "kiosk"

/** Visitor-facing entry point for host emails. */
export function hostEntryLabel(
  source: HostEntrySource | null | undefined,
  kioskName?: string | null,
): string {
  if (source === "qr") return "QR code"
  const name = typeof kioskName === "string" ? kioskName.trim() : ""
  return name || "Kiosk"
}

export function inferHostEntrySource(input: {
  entrySource?: HostEntrySource | null
  signedInBy?: string | null
}): HostEntrySource {
  if (input.entrySource === "qr" || input.entrySource === "kiosk") return input.entrySource
  const signed = (input.signedInBy || "").trim().toLowerCase()
  if (signed === "qr" || signed === "qr code" || signed === "qr sign-in") return "qr"
  return "kiosk"
}
