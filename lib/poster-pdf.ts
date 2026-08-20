import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import {
    TALUS_BRAND_GREEN,
    TALUS_MARK_RADIUS,
    TALUS_MARK_VIEWBOX,
    buildQrGeometry,
    buildQrLogoPlate,
} from "@/lib/qr-code"

/**
 * Server-side A4 sign-in poster, drawn as vectors.
 *
 * This exists so admins can hand supervisors a file that prints identically
 * anywhere. Browser "print to PDF" depends on the operator's page setup, scale
 * and margin settings; a generated PDF is a fixed A4 page, so it cannot reflow
 * onto a second sheet or shrink the QR below a scannable size.
 *
 * Everything is drawn from the same geometry helpers the on-screen poster uses,
 * so the two renderings cannot drift apart.
 */

/** A4 at 72dpi, in PostScript points. */
const PAGE_W = 595.28
const PAGE_H = 841.89
const MM = PAGE_W / 210

const INK = rgb(0.05, 0.05, 0.07)
const MUTED = rgb(0.42, 0.44, 0.5)
const RULE = rgb(0.85, 0.86, 0.88)
const WHITE = rgb(1, 1, 1)

function hexToRgb(hex: string) {
    const m = /^#?([\da-f]{6})$/i.exec(hex.trim())
    if (!m) return rgb(0, 0, 0)
    const n = Number.parseInt(m[1], 16)
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Rounded-rectangle path in SVG user units, anchored at the origin. */
function roundedRectPath(w: number, h: number, r: number): string {
    const rad = Math.min(r, w / 2, h / 2)
    return [
        `M ${rad} 0`,
        `H ${w - rad}`,
        `A ${rad} ${rad} 0 0 1 ${w} ${rad}`,
        `V ${h - rad}`,
        `A ${rad} ${rad} 0 0 1 ${w - rad} ${h}`,
        `H ${rad}`,
        `A ${rad} ${rad} 0 0 1 0 ${h - rad}`,
        `V ${rad}`,
        `A ${rad} ${rad} 0 0 1 ${rad} 0`,
        "Z",
    ].join(" ")
}

/** Circle as two arcs, so it can join the glyph's single path string. */
function circlePath(cx: number, cy: number, r: number): string {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx - r} ${cy} Z`
}

/**
 * Draw the Talus mark (green tile + white "t") on a 32-unit grid.
 *
 * `y` is the SVG-style top edge. pdf-lib's drawSvgPath flips the y-axis and
 * anchors at the top-left, so the same coordinates as the SVG version work.
 */
function drawTalusMark(page: PDFPage, x: number, yTop: number, size: number) {
    const scale = size / TALUS_MARK_VIEWBOX
    const y = PAGE_H - yTop

    page.drawSvgPath(roundedRectPath(TALUS_MARK_VIEWBOX, TALUS_MARK_VIEWBOX, TALUS_MARK_RADIUS), {
        x,
        y,
        scale,
        color: hexToRgb(TALUS_BRAND_GREEN),
        borderWidth: 0,
    })

    // Stem, crossbar and leaf dot, matching lib/qr-code.ts TALUS_MARK_GLYPH.
    const stem =
        "M12.4 4H15.6A1.4 1.4 0 0 1 17 5.4V23H19.6A1.4 1.4 0 0 1 21 24.4V26.6A1.4 1.4 0 0 1 19.6 28H15.4C12.9 28 11 26.1 11 23.6V5.4A1.4 1.4 0 0 1 12.4 4Z"
    page.drawSvgPath(stem, { x, y, scale, color: WHITE, borderWidth: 0 })
    page.drawSvgPath(translatePath(roundedRectPath(9, 5, 1.4), 8, 10), {
        x,
        y,
        scale,
        color: WHITE,
        borderWidth: 0,
    })
    page.drawSvgPath(circlePath(20.9, 12.4, 2.6), { x, y, scale, color: WHITE, borderWidth: 0 })
}

/**
 * Shift a path that starts at the origin to (dx, dy).
 *
 * Only used for the crossbar, whose path is generated at the origin. Rewriting
 * the two absolute commands is enough; the arcs in between are relative to the
 * current point.
 */
function translatePath(d: string, dx: number, dy: number): string {
    return d.replace(/([MHVA]|L)\s*([^MHVAZL]*)/gi, (_m, cmd: string, args: string) => {
        const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number)
        if (cmd === "M" || cmd === "L") {
            return `${cmd} ${nums[0] + dx} ${nums[1] + dy} `
        }
        if (cmd === "H") return `H ${nums[0] + dx} `
        if (cmd === "V") return `V ${nums[0] + dy} `
        if (cmd === "A") {
            // rx ry rot large sweep x y
            nums[5] += dx
            nums[6] += dy
            return `A ${nums.join(" ")} `
        }
        return `${cmd} ${args}`
    })
}

/** Centre a single line of text horizontally. */
function drawCentered(
    page: PDFPage,
    text: string,
    { yTop, size, font, color = INK }: { yTop: number; size: number; font: PDFFont; color?: ReturnType<typeof rgb> },
) {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (PAGE_W - w) / 2, y: PAGE_H - yTop - size, size, font, color })
}

/** Greedy wrap that centres each resulting line. */
function drawCenteredWrapped(
    page: PDFPage,
    text: string,
    {
        yTop,
        size,
        font,
        maxWidth,
        lineHeight,
        color = INK,
    }: { yTop: number; size: number; font: PDFFont; maxWidth: number; lineHeight: number; color?: ReturnType<typeof rgb> },
) {
    const words = text.split(/\s+/)
    const lines: string[] = []
    let line = ""
    for (const word of words) {
        const next = line ? `${line} ${word}` : word
        if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
            lines.push(line)
            line = word
        } else {
            line = next
        }
    }
    if (line) lines.push(line)

    lines.forEach((l, i) => drawCentered(page, l, { yTop: yTop + i * lineHeight, size, font, color }))
    return lines.length * lineHeight
}

export interface PosterPdfInput {
    locationName: string
    checkinUrl: string
    companyName: string
    /** Optional logo bytes; PNG or JPEG. Falls back to the Talus mark. */
    logo?: { bytes: Uint8Array; type: "png" | "jpg" } | null
}

export async function buildPosterPdf({
    locationName,
    checkinUrl,
    companyName,
    logo,
}: PosterPdfInput): Promise<Uint8Array> {
    const pdf = await PDFDocument.create()
    pdf.setTitle(`Sign In Point - ${locationName}`)
    pdf.setSubject(checkinUrl)
    const page = pdf.addPage([PAGE_W, PAGE_H])

    const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const margin = 14 * MM
    const contentW = PAGE_W - margin * 2

    /*
      Vertical rhythm mirrors the on-screen poster's `justify-between`: header,
      QR, instruction and footer are spread down the sheet with even gaps. All
      positions below are measured from the TOP of the page and converted at draw
      time, because pdf-lib's own origin is the bottom-left.
    */
    const gap = 34 * MM

    // Heading
    let y = 16 * MM
    drawCentered(page, "Sign In Point", { yTop: y, size: 34, font: bold })
    y += 34 + 4 * MM
    drawCentered(page, "Scan with your phone camera to sign in", {
        yTop: y,
        size: 12,
        font: helvetica,
        color: rgb(0.3, 0.32, 0.38),
    })
    y += 12

    // QR block. Kept large so it stays scannable from across a lobby.
    const qrSize = 108 * MM
    const qrX = (PAGE_W - qrSize) / 2
    const qrTop = y + gap

    const geo = buildQrGeometry({ text: checkinUrl })
    const unit = qrSize / geo.total
    page.drawRectangle({ x: qrX, y: PAGE_H - qrTop - qrSize, width: qrSize, height: qrSize, color: WHITE })
    for (const run of geo.runs) {
        page.drawRectangle({
            x: qrX + run.x * unit,
            // +1 row because rects are drawn from their bottom edge in PDF space.
            y: PAGE_H - qrTop - (run.y + 1) * unit,
            width: run.w * unit,
            height: unit,
            color: rgb(0, 0, 0),
        })
    }

    // Centred logo plate, punched out of the matrix by error correction.
    const plate = buildQrLogoPlate(geo)
    page.drawSvgPath(roundedRectPath(plate.plateSize * unit, plate.plateSize * unit, plate.plateRadius * unit), {
        x: qrX + plate.plateOffset * unit,
        y: PAGE_H - qrTop - plate.plateOffset * unit,
        color: WHITE,
        borderWidth: 0,
    })
    drawTalusMark(page, qrX + plate.markOffset * unit, qrTop + plate.markOffset * unit, plate.markSize * unit)

    // Registration brackets framing the code.
    const bracket = 9 * MM
    const inset = 6 * MM
    const thickness = 1.6
    const left = qrX - inset
    const right = qrX + qrSize + inset
    const top = PAGE_H - qrTop + inset
    const bottom = PAGE_H - qrTop - qrSize - inset
    const bar = (x: number, yy: number, w: number, h: number) =>
        page.drawRectangle({ x, y: yy, width: w, height: h, color: rgb(0, 0, 0) })
    // Each corner is an L: one horizontal and one vertical arm.
    bar(left, top - thickness, bracket, thickness)
    bar(left, top - bracket, thickness, bracket)
    bar(right - bracket, top - thickness, bracket, thickness)
    bar(right - thickness, top - bracket, thickness, bracket)
    bar(left, bottom, bracket, thickness)
    bar(left, bottom, thickness, bracket)
    bar(right - bracket, bottom, bracket, thickness)
    bar(right - thickness, bottom, thickness, bracket)

    // Instruction line
    const instructionTop = qrTop + qrSize + gap
    drawCenteredWrapped(page, "Everyone must sign in when they arrive on site and sign out when they leave.", {
        yTop: instructionTop,
        size: 15,
        font: bold,
        maxWidth: contentW - 12 * MM,
        lineHeight: 20,
    })

    /*
      Footer, pinned to the bottom of the sheet. These are the one place that
      reads naturally in pdf-lib's bottom-up space, so they are expressed as
      heights above the bottom edge rather than distances from the top.
    */
    const ruleY = 24 * MM
    const contentBottom = 13 * MM
    page.drawRectangle({ x: margin, y: ruleY, width: contentW, height: 0.75, color: RULE })

    let brandRight = margin
    const markSize = 11 * MM
    let logoDrawn = false
    if (logo) {
        try {
            const img = logo.type === "png" ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes)
            const h = 10 * MM
            const w = (img.width / img.height) * h
            page.drawImage(img, { x: margin, y: contentBottom, width: w, height: h })
            brandRight = margin + w
            logoDrawn = true
        } catch {
            // Unsupported or corrupt logo: fall through to the Talus mark below.
        }
    }
    if (!logoDrawn) {
        // drawTalusMark takes a distance from the page top, so convert.
        drawTalusMark(page, margin, PAGE_H - contentBottom - markSize, markSize)
        brandRight = margin + markSize
        page.drawText(companyName, {
            x: brandRight + 3 * MM,
            y: contentBottom + 3.5 * MM,
            size: 12,
            font: bold,
            color: INK,
        })
    }

    const label = "LOCATION"
    const labelW = bold.widthOfTextAtSize(label, 9)
    page.drawText(label, {
        x: PAGE_W - margin - labelW,
        y: contentBottom + 8 * MM,
        size: 9,
        font: bold,
        color: MUTED,
    })
    const nameW = bold.widthOfTextAtSize(locationName, 14)
    page.drawText(locationName, {
        x: PAGE_W - margin - nameW,
        y: contentBottom + 2 * MM,
        size: 14,
        font: bold,
        color: INK,
    })

    return pdf.save()
}
