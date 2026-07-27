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
    const qr = QRCode.create(text, { errorCorrectionLevel: "H" })
    const count = qr.modules.size
    const data = qr.modules.data
    const total = count + margin * 2

    // Merge horizontally adjacent dark modules into single rects. Fewer shapes
    // means a smaller file and, more importantly, no hairline seams between
    // neighbouring rects when printed or scaled.
    const rects: string[] = []
    for (let row = 0; row < count; row++) {
        let runStart = -1
        for (let col = 0; col <= count; col++) {
            const isDark = col < count && data[row * count + col] === 1
            if (isDark && runStart === -1) {
                runStart = col
            } else if (!isDark && runStart !== -1) {
                rects.push(
                    `<rect x="${runStart + margin}" y="${row + margin}" width="${col - runStart}" height="1"/>`,
                )
                runStart = -1
            }
        }
    }

    let logoMarkup = ""
    if (logo) {
        // Snap the plate to whole modules so it reads as a deliberate element
        // rather than a smudge across partial modules.
        const plate = Math.round(count * logoRatio)
        const plateSize = plate % 2 === count % 2 ? plate : plate + 1
        const plateOffset = margin + (count - plateSize) / 2

        // White gutter keeps the mark from touching live modules.
        const gutter = plateSize * 0.08
        const markSize = plateSize - gutter * 2
        const markOffset = plateOffset + gutter

        logoMarkup = [
            `<rect x="${plateOffset}" y="${plateOffset}" width="${plateSize}" height="${plateSize}" rx="${plateSize * 0.16}" fill="${light}"/>`,
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
