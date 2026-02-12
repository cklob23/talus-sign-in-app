"use client"

import React from "react"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Mail, CheckCircle, AlertCircle } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { TalusAgLogo } from "@/components/talusag-logo"
import { useBranding } from "@/hooks/use-branding"

export default function ForgotPasswordPage() {
    const { branding } = useBranding()
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            const supabase = createClient()

            // Get the current origin for the redirect URL
            const redirectUrl = `${window.location.origin}/kiosk/reset-password`

            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: redirectUrl,
            })

            if (resetError) {
                throw resetError
            }

            setIsSuccess(true)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send reset email")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Header */}
            <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 items-center px-4">
                    <Link href="/kiosk">
                        <TalusAgLogo />
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <Mail className="w-6 h-6 text-primary" />
                        </div>
                        <CardTitle className="text-2xl">Forgot Password</CardTitle>
                        <CardDescription>
                            {isSuccess
                                ? "Check your email for the reset link"
                                : "Enter your email and we'll send you a link to reset your password"
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isSuccess ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                                    <div className="text-sm">
                                        <p className="font-medium text-green-800">Email sent!</p>
                                        <p className="text-green-700">
                                            We've sent a password reset link to <strong>{email}</strong>.
                                            Please check your inbox and spam folder.
                                        </p>
                                    </div>
                                </div>
                                <Button asChild variant="outline" className="w-full bg-transparent">
                                    <Link href="/kiosk">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Back to Sign In
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
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder={`you@${branding.companyName?.toLowerCase().replace(/[\s.-]+/g, "") || "talusag"}.com`}
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? "Sending..." : "Send Reset Link"}
                                </Button>

                                <Button asChild variant="ghost" className="w-full">
                                    <Link href="/kiosk">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Back to Sign In
                                    </Link>
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
