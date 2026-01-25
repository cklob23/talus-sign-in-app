"use client"

import type React from "react"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { TalusAgLogo } from "@/components/talusag-logo"

export default function SignUpPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/admin`,
          data: {
            full_name: fullName,
            role: "staff",
          },
        },
      })
      if (error) throw error
      router.push("/auth/sign-up-success")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleMicrosoftSignUp = async () => {
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const redirectUrl = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || 
        `${window.location.origin}/auth/callback`
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          redirectTo: `${redirectUrl}?type=admin&next=/admin`,
          scopes: "email profile openid User.Read",
          queryParams: {
            prompt: "select_account",
          },
        },
      })
      if (error) throw error
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
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
            <CardHeader className="text-center p-4 sm:p-6">
              <CardTitle className="text-xl sm:text-2xl">Create Account</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Register for admin access to the visitor management system</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
              <form onSubmit={handleSignUp}>
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="fullName" className="text-sm">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email" className="text-sm">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@talusag.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password" className="text-sm">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword" className="text-sm">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Creating account..." : "Create Account"}
                  </Button>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-transparent"
                    onClick={handleMicrosoftSignUp}
                    disabled={isLoading}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                    </svg>
                    Sign up with Microsoft
                  </Button>
                </div>
                <div className="mt-4 text-center text-xs sm:text-sm">
                  Already have an account?{" "}
                  <Link href="/auth/login" className="underline underline-offset-4 text-primary">
                    Sign in
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
