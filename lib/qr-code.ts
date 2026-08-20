import QRCode from "qrcode"

/**
 * Branded QR code rendering.
 *
 * We generate the QR matrix with the `qrcode` package but emit the SVG
 * ourselves. That gives us three things the previous external-image approach
 * could not provide:
 *   1. Vector output, so the code stays razor sharp at any print size.
 *   2. A centered logo, which requires punching a hole in the matrix.
 *   3. No network dependency, so posters always render.
 *
 * The logo is only safe because we force error-correction level "H" (~30% of
 * the data is recoverable). The covered area is kept well under that budget.
 */

/**
 * Talus lowercase "t" mark, rebuilt as vector primitives.
 *
 * Note: public/icon.svg is the default v0 scaffold favicon, not Talus branding.
 * The real mark is the uploaded 32x32 brand favicon (green tile, white "t" with
 * a leaf dot). A 32px raster would look soft blown up on a poster, so the glyph
 * is reproduced here from that favicon's geometry on a 32-unit grid.
 */
export const TALUS_MARK_VIEWBOX = 32
export const TALUS_MARK_RADIUS = 7
export const TALUS_BRAND_GREEN = "#0da665"
export const TALUS_WORDMARK_INK = "#161523"
export const TALUS_LEAF_GREEN = "#8dc242"

/** The "t": stem with a foot that hooks right, plus the crossbar and leaf dot. */
export const TALUS_MARK_GLYPH = [
    '<path d="M12.4 4H15.6A1.4 1.4 0 0 1 17 5.4V23H19.6A1.4 1.4 0 0 1 21 24.4V26.6A1.4 1.4 0 0 1 19.6 28H15.4C12.9 28 11 26.1 11 23.6V5.4A1.4 1.4 0 0 1 12.4 4Z"/>',
    '<rect x="8" y="10" width="9" height="5" rx="1.4"/>',
    '<circle cx="20.9" cy="12.4" r="2.6"/>',
].join("")

/** Self-contained Talus mark markup (rounded brand tile + white glyph). */
export function buildTalusMark({
    size = TALUS_MARK_VIEWBOX,
    x = 0,
    y = 0,
    background = TALUS_BRAND_GREEN,
    foreground = "#ffffff",
}: {
    size?: number
    x?: number
    y?: number
    background?: string
    foreground?: string
} = {}): string {
    const scale = size / TALUS_MARK_VIEWBOX
    return [
        `<g transform="translate(${x} ${y}) scale(${scale})">`,
        `<rect width="${TALUS_MARK_VIEWBOX}" height="${TALUS_MARK_VIEWBOX}" rx="${TALUS_MARK_RADIUS}" fill="${background}"/>`,
        `<g fill="${foreground}">${TALUS_MARK_GLYPH}</g>`,
        `</g>`,
    ].join("")
}

/** A run of horizontally adjacent dark modules, in module units. */
export interface QrRun {
    x: number
    y: number
    w: number
}

export interface QrGeometry {
    /** Modules per side, excluding the quiet zone. */
    count: number
    /** Quiet zone width in modules. */
    margin: number
    /** Full side length in modules, including both quiet zones. */
    total: number
    /** Dark modules, merged into horizontal runs. */
    runs: QrRun[]
}

/**
 * Compute the QR module layout in module units.
 *
 * Shared by the SVG renderer and the PDF poster builder so both draw byte-for
 * byte the same code. Adjacent dark modules are merged into horizontal runs:
 * fewer shapes means smaller output and no hairline seams between neighbouring
 * rects when printed or scaled.
 */
export function buildQrGeometry({ text, margin = 4 }: { text: string; margin?: number }): QrGeometry {
    const qr = QRCode.create(text, { errorCorrectionLevel: "H" })
    const count = qr.modules.size
    const data = qr.modules.data

    const runs: QrRun[] = []
    for (let row = 0; row < count; row++) {
        let runStart = -1
        for (let col = 0; col <= count; col++) {
            const isDark = col < count && data[row * count + col] === 1
            if (isDark && runStart === -1) {
                runStart = col
            } else if (!isDark && runStart !== -1) {
                runs.push({ x: runStart + margin, y: row + margin, w: col - runStart })
                runStart = -1
            }
        }
    }

    return { count, margin, total: count + margin * 2, runs }
}

/**
 * Geometry of the centred logo plate, in module units.
 *
 * Returned separately from the matrix because the plate is snapped to whole
 * modules, so it reads as a deliberate element rather than a smudge across
 * partial modules.
 */
export function buildQrLogoPlate({ count, margin }: Pick<QrGeometry, "count" | "margin">, logoRatio = 0.22) {
    const plate = Math.round(count * logoRatio)
    const plateSize = plate % 2 === count % 2 ? plate : plate + 1
    const plateOffset = margin + (count - plateSize) / 2

    // White gutter keeps the mark from touching live modules.
    const gutter = plateSize * 0.08
    return {
        plateSize,
        plateOffset,
        plateRadius: plateSize * 0.16,
        markSize: plateSize - gutter * 2,
        markOffset: plateOffset + gutter,
    }
}

export interface BuildQrSvgOptions {
    /** Data encoded in the QR code (usually the check-in URL). */
    text: string
    /** Rendered pixel size of the square SVG. Vector, so this is only a hint. */
    size?: number
    /** Draw the Talus mark in the middle. */
    logo?: boolean
    /** Quiet zone in modules. The spec requires 4; never go below it. */
    margin?: number
    /** Fraction of the code's width covered by the logo plate. */
    logoRatio?: number
    /** Dark module colour. Pure black maximises scanner contrast. */
    dark?: string
    /** Light/background colour. */
    light?: string
    /** Tile colour behind the Talus mark. */
    logoBackground?: string
}

/**
 * Build a self-contained SVG string for a QR code.
 *
 * The viewBox is expressed in module units, so every module lands on an exact
 * integer coordinate. This is what eliminates the blurry, half-pixel edges you
 * get from scaling a raster QR image.
 */
export function buildQrSvg({
    text,
    size = 512,
    logo = true,
    margin = 4,
    logoRatio = 0.22,
    dark = "#000000",
    light = "#ffffff",
    logoBackground = TALUS_BRAND_GREEN,
}: BuildQrSvgOptions): string {
    const { count, total, runs } = buildQrGeometry({ text, margin })
    const rects = runs.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1"/>`)

    let logoMarkup = ""
    if (logo) {
        const { plateSize, plateOffset, plateRadius, markSize, markOffset } = buildQrLogoPlate(
            { count, margin },
            logoRatio,
        )
        logoMarkup = [
            `<rect x="${plateOffset}" y="${plateOffset}" width="${plateSize}" height="${plateSize}" rx="${plateRadius}" fill="${light}"/>`,
            buildTalusMark({ size: markSize, x: markOffset, y: markOffset, background: logoBackground }),
        ].join("")
    }

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`,
        ` viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img"`,
        ` aria-label="QR code">`,
        `<rect width="${total}" height="${total}" fill="${light}"/>`,
        `<g fill="${dark}">${rects.join("")}</g>`,
        logoMarkup,
        `</svg>`,
    ].join("")
}

/** Absolute check-in URL encoded into a location's QR code. */
export function buildCheckinUrl(origin: string, token: string): string {
    return `${origin.replace(/\/$/, "")}/checkin/${token}`
}
