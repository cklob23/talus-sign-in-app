/**
 * Shared utility for printing visitor badges.
 * Opens a print-ready popup window with full-page landscape badge layout
 * optimized for Brother Color Label Printers and similar label printers.
 */

export interface BadgePrintData {
  visitorName: string
  visitorCompany?: string
  visitorType?: string
  badgeNumber: string
  locationName?: string
  photoUrl?: string
  initials?: string
  date?: string
}

export function printVisitorBadge(data: BadgePrintData, logoPath = "/talusAg_Logo.png") {
  const {
    visitorName,
    visitorCompany,
    visitorType,
    badgeNumber,
    locationName,
    photoUrl,
    date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    initials = visitorName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2),
  } = data

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const logoSrc = `${origin}${logoPath}`

  const printWindow = window.open("", "_blank", "width=800,height=600")
  if (!printWindow) return

  printWindow.document.open()
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Visitor Badge - ${visitorName}</title>
      <style>
        @page {
          size: landscape;
          margin: 0;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color-adjust: exact;
        }

        body {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
        }

        .badge {
          width: 100vw;
          height: 100vh;
          background: #fff;
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          display: flex;
          flex-direction: row;
          padding: 4%;
          position: relative;
        }

        .lanyard-slot {
          position: absolute;
          top: 2%;
          left: 50%;
          transform: translateX(-50%);
          width: 6vmin;
          height: 1.5vmin;
          background: #e5e7eb;
          border-radius: 4px;
        }

        .photo-section {
          width: 40%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding-right: 4%;
        }

        .visitor-photo {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
          border: 6px solid #9ca3af;
          background: #e5e7eb;
        }

        .photo-placeholder {
          width: 100%;
          aspect-ratio: 1;
          background: #e5e7eb;
          border: 6px solid #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
          font-size: 10vmin;
          font-weight: 700;
        }

        .info-section {
          width: 60%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding-left: 3%;
        }

        .logo {
          max-width: 22vmin;
          height: auto;
          margin-bottom: 3%;
          align-self: flex-end;
        }

        .visitor-name {
          font-size: 5.5vmin;
          font-weight: bold;
          color: #111;
          margin: 1% 0;
          line-height: 1.2;
        }

        .visitor-type {
          font-size: 2.5vmin;
          font-weight: 600;
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0.5% 0;
        }

        .location {
          font-size: 2.2vmin;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          margin: 0.5% 0;
        }

        .badge-number {
          font-size: 2vmin;
          color: #9ca3af;
          margin-top: 2%;
        }

        .print-controls {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 12px;
          z-index: 100;
        }

        .print-btn {
          padding: 10px 32px;
          font-size: 16px;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-family: Arial, sans-serif;
        }

        .print-btn-primary {
          background: #16a34a;
          color: #fff;
        }

        .print-btn-primary:hover {
          background: #15803d;
        }

        .print-btn-secondary {
          background: #e5e7eb;
          color: #374151;
        }

        .print-btn-secondary:hover {
          background: #d1d5db;
        }

        @media print {
          html, body {
            width: 100%;
            height: 100%;
            background: #fff;
          }
          body {
            display: block;
          }
          .badge {
            width: 100%;
            height: 100%;
            border: 2px dashed #d1d5db;
          }
          .print-controls {
            display: none !important;
          }
        }

        @media screen {
          .badge {
            max-width: 900px;
            max-height: 600px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          }
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

      <div class="print-controls">
        <button class="print-btn print-btn-primary" onclick="window.print()">Print Badge</button>
        <button class="print-btn print-btn-secondary" onclick="window.close()">Close</button>
      </div>
    </body>
    </html>
  `)
  printWindow.document.close()
}
