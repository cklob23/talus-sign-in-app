"use client"

import Link from "next/link"
import { TalusAgLogo } from "@/components/talusag-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserCheck, Shield, ClipboardList } from "lucide-react"
import { useBranding } from "@/hooks/use-branding"

export default function HomePage() {
  const { branding, isLoading } = useBranding()

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/50 to-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <TalusAgLogo />
          <nav className="flex items-center gap-4">
            <Link href="/auth/login">
              <Button variant="ghost">Admin Login</Button>
            </Link>
            <Link href="/kiosk">
              <Button>Visitor Sign In</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            {isLoading ? "Welcome to Talus" : `Welcome to ${branding.companyName || "Talus"}`}
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            Secure visitor management for our green ammonia facilities. Sign in quickly and safely.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-16">
          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <UserCheck className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Visitor Sign In</CardTitle>
              <CardDescription>Quick and easy sign-in process for all visitors</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/kiosk">
                <Button className="w-full">Sign In Now</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <ClipboardList className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Pre-Registration</CardTitle>
              <CardDescription>Already registered? Check in with your booking code</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/kiosk?mode=booking">
                <Button variant="outline" className="w-full bg-transparent">
                  Check In
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Administration</CardTitle>
              <CardDescription>Staff access to visitor reports and management</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/auth/login">
                <Button variant="secondary" className="w-full">
                  Admin Portal
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Building reliable domestic production solutions for local farming communities.
          </p>
        </div>
      </main>

      <footer className="border-t py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} {branding.companyName || "Talus"} Visitor Management. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
