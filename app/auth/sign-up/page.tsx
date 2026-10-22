import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TalusAgLogo } from "@/components/talusag-logo"

/**
 * Public self sign-up is disabled. Accounts are created by an administrator
 * (or Entra sync). Leaving the URL live avoids a 404 for old bookmarks.
 */
export default function SignUpPage() {
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
              <CardTitle className="text-xl sm:text-2xl">Accounts are invite-only</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                New staff accounts are created by an administrator. Self sign-up is disabled.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                If you need access, ask an administrator to invite you or wait for your Entra directory account to sync.
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/login">Go to sign in</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
