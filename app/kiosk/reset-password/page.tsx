"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { TalusAgLogo } from "@/components/talusag-logo"
import { Eye, EyeOff, CheckCircle2 } from "lucide-react"

export default function ResetPasswordPage() {
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [isReady, setIsReady] = useState(false)
    const router = useRouter()

    useEffect(() => {
        // Supabase will automatically exchange the token from the email link
        // and establish a session. We just need to wait for it.
        const supabase = createClient()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") {
                setIsReady(true)
            }
        })

        // Also check if we already have a session (in case the event fired before we subscribed)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setIsReady(true)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (password.length < 8) {
            setError("Password must be at least 8 characters long")
            return
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

        setIsLoading(true)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.updateUser({ password })

            if (error) throw error

            setIsSuccess(true)

            // Redirect to login after a short delay
            setTimeout(() => {
                router.push("/auth/login")
            }, 3000)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to update password")
        } finally {
            setIsLoading(false)
        }
    }

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/30 flex flex-col">
                <header className="p-4 sm:p-6">
                    <Link href="/">
                        <TalusAgLogo />
                    </Link>
                </header>
                <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
                    <Card className="w-full max-w-sm">
                        <CardContent className="flex flex-col items-center gap-4 pt-6 pb-6 text-center">
                            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                            <div>
                                <h2 className="text-lg font-semibold">Password Updated</h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Your password has been successfully updated. Redirecting to login...
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
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
                            <CardTitle className="text-xl">Set New Password</CardTitle>
                            <CardDescription>
                                Enter your new password below
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!isReady ? (
                                <div className="flex flex-col items-center gap-3 py-6">
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                    <p className="text-sm text-muted-foreground">Verifying reset link...</p>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {error && (
                                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                                            {error}
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <Label htmlFor="password">New Password</Label>
                                        <div className="relative">
                                            <Input
                                                id="password"
                                                type={showPassword ? "text" : "password"}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Enter new password"
                                                required
                                                minLength={8}
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
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm new password"
                                            required
                                        />
                                    </div>

                                    <Button type="submit" className="w-full" disabled={isLoading}>
                                        {isLoading ? "Updating..." : "Update Password"}
                                    </Button>

                                    <div className="text-center">
                                        <Link href="/auth/login" className="text-xs text-muted-foreground hover:underline">
                                            Back to Login
                                        </Link>
                                    </div>
                                </form>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
