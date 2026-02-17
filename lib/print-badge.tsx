/**
 * Shared utility for printing visitor badges.
 * Opens a print-ready popup window with the badge layout and triggers window.print().
 */

export interface BadgePrintData {
    visitorName: string
    visitorCompany?: string
    visitorType?: string
    badgeNumber: string
    locationName?: string
    photoUrl?: string
    initials?: string
}

export function printVisitorBadge(data: BadgePrintData, logoPath = "/talusAg_Logo.png") {
    const {
        visitorName,
        visitorCompany,
        visitorType,
        badgeNumber,
        locationName,
        photoUrl,
        initials = visitorName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2),
    } = data

    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const logoSrc = `${origin}${logoPath}`

    const printWindow = window.open("", "_blank", "width=400,height=300")
    if (!printWindow) return

    printWindow.document.open()
    printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Visitor Badge</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 20px;
        }
        .badge {
          width: 3.375in;
          height: 2.125in;
          background: #fff;
          border-radius: 8px;
          border: 1px dashed #d1d5db;
          display: flex;
          padding: 12px;
          margin: 0 auto;
          position: relative;
          box-sizing: border-box;
        }
        .lanyard-slot {
          position: absolute;
          top: 6px;
          left: 50%;
          transform: translateX(-50%);
          width: 30px;
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
        }
        .photo-section {
          width: 40%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding-right: 12px;
        }
        .visitor-photo {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
          border: 4px solid #9ca3af;
          background: #e5e7eb;
        }
        .photo-placeholder {
          width: 100%;
          aspect-ratio: 1;
          background: #e5e7eb;
          border: 4px solid #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
          font-size: 36px;
        }
        .info-section {
          width: 60%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding-left: 8px;
        }
        .logo {
          max-width: 100px;
          height: auto;
          margin-bottom: 8px;
          align-self: flex-end;
        }
        .visitor-name {
          font-size: 20px;
          font-weight: bold;
          color: #111;
          margin: 4px 0;
          line-height: 1.2;
        }
        .visitor-type {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 2px 0;
        }
        .location {
          font-size: 11px;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          margin: 2px 0;
        }
        .badge-number {
          font-size: 10px;
          color: #9ca3af;
          margin-top: 6px;
        }
        @media print {
          body { margin: 0; padding: 0; }
          .badge { border: 1px dashed #d1d5db; }
        }
      </style>
    </head>
    <body>
      <div class="badge">
        <div class="lanyard-slot"></div>
        <div class="photo-section">
          ${photoUrl
            ? `<img src="${photoUrl}" class="visitor-photo" crossorigin="anonymous" />`
            : `<div class="photo-placeholder">${initials}</div>`
        }
        </div>
        <div class="info-section">
          <img src="${logoSrc}" alt="Logo" class="logo" />
          <div class="visitor-name">${visitorName}</div>
          <div class="visitor-type">${visitorCompany || visitorType || "Visitor"}</div>
          ${locationName ? `<div class="location">${locationName}</div>` : ""}
          <div class="badge-number">${badgeNumber}</div>
        </div>
      </div>

      <script>
        window.onload = () => {
          setTimeout(() => {
            window.print()
            window.close()
          }, 300)
        }
      </script>
    </body>
    </html>
  `)
    printWindow.document.close()
}
