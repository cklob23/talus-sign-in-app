import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeColorsLoader } from "@/components/theme-colors-loader"
import { getBrandingSettings } from "@/lib/branding"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export async function generateMetadata(): Promise<Metadata> {
  let companyName = "Talus Ag"
  try {
    const branding = await getBrandingSettings()
    companyName = branding.companyName
  } catch {
    // Fall back to default if DB isn't available yet
  }

  return {
    title: `${companyName} Visitor Management`,
    description: `Secure visitor sign-in and management system for ${companyName} facilities`,
    generator: "Developed by Caleb Klobe",
    verification: {
      google: "qamAell290fOZH1ZChhZclrDV9VA75x213hk1A6SNpI",
    },
    icons: {
      icon: [
        {
          url: "/icon-light-32x32.png",
          media: "(prefers-color-scheme: light)",
        },
        {
          url: "/icon-dark-32x32.png",
          media: "(prefers-color-scheme: dark)",
        },
        {
          url: "/icon.svg",
          type: "image/svg+xml",
        },
      ],
      apple: "/apple-icon.png",
    },
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ThemeColorsLoader />
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
