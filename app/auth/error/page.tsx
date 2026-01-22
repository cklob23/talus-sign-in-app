import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TalusAgLogo } from "@/components/talusag-logo"
import { AlertCircle } from "lucide-react"

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/30 flex flex-col">
      <header className="p-4 sm:p-6">
        <Link href="/">
          <TalusAgLogo />
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm">
          <Card className="text-center">
            <CardHeader className="p-4 sm:p-6">
              <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-3 sm:mb-4">
                <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-destructive" />
              </div>
              <CardTitle className="text-xl sm:text-2xl">Authentication Error</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Something went wrong during authentication</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
              <p className="text-xs sm:text-sm text-muted-foreground">
                The authentication link may have expired or is invalid. Please try signing in again.
              </p>
              <Link href="/auth/login">
                <Button className="w-full">Back to Login</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
