"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { TalusAgLogo } from "@/components/talusag-logo"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAzureLogin = async () => {
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    const redirectBase =
      process.env.NEXT_PUBLIC_SITE_URL || window.location.origin

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${redirectBase}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setIsLoading(false)
    }
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/30 flex flex-col">
      <header className="p-4 sm:p-6">
        <Link href="/">
          <TalusAgLogo />
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-xl sm:text-2xl">Admin Login</CardTitle>
              <CardDescription>
                Sign in with Microsoft
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="flex flex-col gap-4">
                {error && (
                  <p className="text-sm text-destructive text-center">
                    {error}
                  </p>
                )}

                <Button
                  onClick={handleAzureLogin}
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Redirecting…" : "Sign in with Microsoft"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
