/**
 * Placed-field model shared by the admin placement editor and the server-side
 * PDF stamper. Kept free of server-only imports so it is safe in client code.
 *
 * Positions are fractions of the page box with a TOP-LEFT origin (0,0 = top
 * left, 1,1 = bottom right), so the same numbers describe the box whether the
 * editor rendered the page at 800px or the stamper works in PDF points.
 */

export type NdaFieldRole = "visitor" | "company"

export type NdaFieldKind = "signature" | "name" | "title" | "date" | "effective_date" | "company"

export interface NdaFieldPosition {
    id: string
    role: NdaFieldRole
    kind: NdaFieldKind
    page: number
    xPct: number
    yPct: number
    wPct: number
    hPct: number
    fontSize?: number
}

export interface NdaFieldTypeDef {
    role: NdaFieldRole
    kind: NdaFieldKind
    label: string
    shortLabel: string
    defaultWPct: number
    defaultHPct: number
    isImage: boolean
}

/**
 * The catalog offered in the editor palette. "visitor" fields are filled at
 * check-in; "company" fields are filled when a Talus executive countersigns.
 */
export const NDA_FIELD_TYPES: NdaFieldTypeDef[] = [
    { role: "visitor", kind: "signature", label: "Visitor signature", shortLabel: "Signature", defaultWPct: 0.28, defaultHPct: 0.06, isImage: true },
    { role: "visitor", kind: "name", label: "Visitor name", shortLabel: "Name", defaultWPct: 0.28, defaultHPct: 0.028, isImage: false },
    { role: "visitor", kind: "company", label: "Visitor company", shortLabel: "Company", defaultWPct: 0.28, defaultHPct: 0.028, isImage: false },
    { role: "visitor", kind: "title", label: "Visitor title", shortLabel: "Title", defaultWPct: 0.28, defaultHPct: 0.028, isImage: false },
    { role: "visitor", kind: "date", label: "Visitor date signed", shortLabel: "Date", defaultWPct: 0.2, defaultHPct: 0.028, isImage: false },
    { role: "visitor", kind: "effective_date", label: "Effective date", shortLabel: "Effective date", defaultWPct: 0.2, defaultHPct: 0.028, isImage: false },
    { role: "company", kind: "signature", label: "Talus signature", shortLabel: "Signature", defaultWPct: 0.28, defaultHPct: 0.06, isImage: true },
    { role: "company", kind: "name", label: "Talus name", shortLabel: "Name", defaultWPct: 0.28, defaultHPct: 0.028, isImage: false },
    { role: "company", kind: "title", label: "Talus title", shortLabel: "Title", defaultWPct: 0.28, defaultHPct: 0.028, isImage: false },
    { role: "company", kind: "date", label: "Talus date signed", shortLabel: "Date", defaultWPct: 0.2, defaultHPct: 0.028, isImage: false },
]

export function fieldTypeDef(role: NdaFieldRole, kind: NdaFieldKind): NdaFieldTypeDef | undefined {
    return NDA_FIELD_TYPES.find((t) => t.role === role && t.kind === kind)
}

export function fieldLabel(role: NdaFieldRole, kind: NdaFieldKind): string {
    return fieldTypeDef(role, kind)?.label ?? kind
}

/** Distinct colours per role so the two signing parties read at a glance. */
export const ROLE_COLORS: Record<NdaFieldRole, { border: string; bg: string; text: string; label: string }> = {
    visitor: { border: "#2563eb", bg: "rgba(37,99,235,0.14)", text: "#1d4ed8", label: "Visitor" },
    company: { border: "#7c3aed", bg: "rgba(124,58,237,0.14)", text: "#6d28d9", label: "Talus" },
}

/** Runtime guard so a malformed stored array can never crash the stamper. */
export function isValidFieldPosition(v: unknown): v is NdaFieldPosition {
    if (!v || typeof v !== "object") return false
    const f = v as Record<string, unknown>
    return (
        typeof f.id === "string" &&
        (f.role === "visitor" || f.role === "company") &&
        typeof f.kind === "string" &&
        typeof f.page === "number" &&
        typeof f.xPct === "number" &&
        typeof f.yPct === "number" &&
        typeof f.wPct === "number" &&
        typeof f.hPct === "number"
    )
}

export function parseFieldPositions(raw: unknown): NdaFieldPosition[] {
    if (!Array.isArray(raw)) return []
    return raw.filter(isValidFieldPosition)
}
