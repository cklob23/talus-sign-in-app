/**
 * WCAG 2.1 contrast helpers for brand color settings and UI tokens.
 * White-on-primary button text needs 4.5:1 for normal text.
 */

export const AA_NORMAL_TEXT = 4.5
export const AA_LARGE_TEXT = 3
export const AA_NON_TEXT = 3

export const RECOMMENDED_PRIMARY = "#00854c"
export const ACCENT_GREEN = "#00b162"

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace("#", "")
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  }
}

function channel(value: number): number {
  const s = value / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

export function contrastRatio(foreground: string, background: string): number | null {
  const l1 = relativeLuminance(foreground)
  const l2 = relativeLuminance(background)
  if (l1 === null || l2 === null) return null
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function passesAaWithWhite(hex: string, minRatio = AA_NORMAL_TEXT): boolean {
  const ratio = contrastRatio("#ffffff", hex)
  return ratio !== null && ratio >= minRatio
}

export function contrastWarning(hex: string): string | null {
  const ratio = contrastRatio("#ffffff", hex)
  if (ratio === null) return "Enter a six-digit hex color."
  if (ratio >= AA_NORMAL_TEXT) return null
  return `White text on ${hex.toUpperCase()} is ${ratio.toFixed(2)}:1. WCAG AA needs 4.5:1. Use ${RECOMMENDED_PRIMARY} or a darker green.`
}
