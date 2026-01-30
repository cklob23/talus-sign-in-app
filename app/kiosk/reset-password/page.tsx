"use client"

import React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Lock, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { TalusAgLogo } from "@/components/talusag-logo"

export default function ResetPasswordPage() {
    const router = useRouter()
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isValidSession, setIsValidSession] = useState<boolean | null>(null)

    // Check if we have a valid recovery session
    useEffect(() => {
        async function checkSession() {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()

            // Check if this is a recovery session (user clicked email link)
            if (session) {
                setIsValidSession(true)
            } else {
                // Try to get the session from URL hash (Supabase puts tokens there)
                const hashParams = new URLSearchParams(window.location.hash.substring(1))
                const accessToken = hashParams.get("access_token")
                const refreshToken = hashParams.get("refresh_token")
                const type = hashParams.get("type")

                if (accessToken && type === "recovery") {
                    // Set the session from the recovery tokens
                    const { error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken || "",
                    })

                    if (!error) {
                        setIsValidSession(true)
                        // Clean up the URL
                        window.history.replaceState(null, "", window.location.pathname)
                        return
                    }
                }

                setIsValidSession(false)
            }
        }

        checkSession()
    }, [])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        // Validate passwords match
        if (password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

        // Validate password strength
        if (password.length < 8) {
            setError("Password must be at least 8 characters long")
            return
        }

        setIsLoading(true)

        try {
            const supabase = createClient()

            const { error: updateError } = await supabase.auth.updateUser({
                password: password,
            })

            if (updateError) {
                throw updateError
            }

            // Sign out after password reset so they can sign in fresh
            await supabase.auth.signOut()

            setIsSuccess(true)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reset password")
        } finally {
            setIsLoading(false)
        }
    }

    // Loading state while checking session
    if (isValidSession === null) {
        return (
            <div className="min-h-screen bg-background flex flex-col">
                <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="container flex h-14 items-center px-4">
                        <Link href="/kiosk" className="flex items-center gap-2">
                            <Image src="/talus-t-logo.png" alt="Talus" width={32} height={32} className="rounded" />
                            <span className="font-semibold">Talus Sign In</span>
                        </Link>
                    </div>
                </header>
                <main className="flex-1 flex items-center justify-center p-4">
                    <p className="text-muted-foreground">Verifying reset link...</p>
                </main>
            </div>
        )
    }

    // Invalid or expired link
    if (!isValidSession) {
        return (
            <div className="min-h-screen bg-background flex flex-col">
                <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="container flex h-14 items-center px-4">
                        <Link href="/kiosk" className="flex items-center gap-2">
                            <Image src="/talus-t-logo.png" alt="Talus" width={32} height={32} className="rounded" />
                            <span className="font-semibold">Talus Sign In</span>
                        </Link>
                    </div>
                </header>
                <main className="flex-1 flex items-center justify-center p-4">
                    <Card className="w-full max-w-md">
                        <CardHeader className="text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <CardTitle className="text-2xl">Invalid or Expired Link</CardTitle>
                            <CardDescription>
                                This password reset link is invalid or has expired. Please request a new one.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <Button asChild className="w-full">
                                    <Link href="/kiosk/forgot-password">Request New Link</Link>
                                </Button>
                                <Button asChild variant="outline" className="w-full bg-transparent">
                                    <Link href="/kiosk">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Back to Sign In
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </main>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Header */}
            <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 items-center px-4">
                    <Link href="/kiosk" className="flex items-center gap-2">
                        <TalusAgLogo />
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            {isSuccess ? (
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            ) : (
                                <Lock className="w-6 h-6 text-primary" />
                            )}
                        </div>
                        <CardTitle className="text-2xl">
                            {isSuccess ? "Password Reset!" : "Reset Your Password"}
                        </CardTitle>
                        <CardDescription>
                            {isSuccess
                                ? "Your password has been successfully reset"
                                : "Enter your new password below"
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isSuccess ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                                    <p className="text-sm text-green-700">
                                        You can now sign in with your new password.
                                    </p>
                                </div>
                                <Button asChild className="w-full">
                                    <Link href="/kiosk">
                                        Go to Sign In
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                                        <p className="text-sm text-red-700">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="password">New Password</Label>
                                    <div className="relative">
                                        <Input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Enter new password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            minLength={8}
                                            autoFocus
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            {showPassword ? (
                                                <EyeOff className="w-4 h-4 text-muted-foreground" />
                                            ) : (
                                                <Eye className="w-4 h-4 text-muted-foreground" />
                                            )}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                                    <Input
                                        id="confirmPassword"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Confirm new password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        minLength={8}
                                    />
                                </div>

                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? "Resetting..." : "Reset Password"}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
