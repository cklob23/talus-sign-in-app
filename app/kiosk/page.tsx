"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { TalusAgLogo } from "@/components/talusag-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { UserPlus, LogOut, CheckCircle, ArrowLeft, Clock, Building2 } from "lucide-react"
import type { VisitorType, Host, Location } from "@/types/database"

type KioskMode = "home" | "sign-in" | "sign-out" | "success"

interface SignInForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  company: string
  locationId: string
  visitorTypeId: string
  hostId: string
  purpose: string
}

export default function KioskPage() {
  const [mode, setMode] = useState<KioskMode>("home")
  const [visitorTypes, setVisitorTypes] = useState<VisitorType[]>([])
  const [hosts, setHosts] = useState<Host[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signOutEmail, setSignOutEmail] = useState("")
  const [successData, setSuccessData] = useState<{ name: string; badge: string; type: "in" | "out" } | null>(null)

  const [form, setForm] = useState<SignInForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    locationId: "",
    visitorTypeId: "",
    hostId: "",
    purpose: "",
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()

    const [{ data: locData }, { data: typesData }, { data: hostsData }] = await Promise.all([
      supabase.from("locations").select("*").order("name"),
      supabase.from("visitor_types").select("*").order("name"),
      supabase.from("hosts").select("*").eq("is_active", true).order("name"),
    ])

    if (locData && locData.length > 0) {
      setLocations(locData)
      setSelectedLocation(locData[0].id)
    }
    if (typesData) setVisitorTypes(typesData)
    if (hostsData) setHosts(hostsData)
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      console.log(supabase, form)
      // Create or find visitor
      const { data: visitor, error: visitorError } = await supabase
        .from("visitors")
        .insert({
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          company: form.company || null,
        })
        .select()
        .single()

      if (visitorError) throw visitorError

      // Generate badge number
      const badgeNumber = `V${String(Date.now()).slice(-6)}`

      // Create sign-in record
      const { error: signInError } = await supabase.from("sign_ins").insert({
        visitor_id: visitor.id,
        location_id: form.locationId,
        visitor_type_id: form.visitorTypeId || null,
        host_id: form.hostId || null,
        purpose: form.purpose || null,
        badge_number: badgeNumber,
      })

      if (signInError) throw signInError

      setSuccessData({
        name: `${form.firstName} ${form.lastName}`,
        badge: badgeNumber,
        type: "in",
      })
      setMode("success")
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSignOut(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Find the visitor's active sign-in
      const { data: signIn, error: findError } = await supabase
        .from("sign_ins")
        .select("*, visitor:visitors(*)")
        .is("sign_out_time", null)
        .eq("visitors.email", signOutEmail)
        .order("sign_in_time", { ascending: false })
        .limit(1)
        .single()

      if (findError || !signIn) {
        throw new Error("No active sign-in found for this email")
      }

      // Update sign-out time
      const { error: updateError } = await supabase
        .from("sign_ins")
        .update({ sign_out_time: new Date().toISOString() })
        .eq("id", signIn.id)

      if (updateError) throw updateError

      setSuccessData({
        name: `${signIn.visitor?.first_name} ${signIn.visitor?.last_name}`,
        badge: signIn.badge_number || "",
        type: "out",
      })
      setMode("success")
      setSignOutEmail("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign out")
    } finally {
      setIsLoading(false)
    }
  }

  function resetForm() {
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      company: "",
      locationId: "",
      visitorTypeId: "",
      hostId: "",
      purpose: "",
    })
  }

  function handleReset() {
    setMode("home")
    setError(null)
    setSuccessData(null)
    resetForm()
    setSignOutEmail("")
  }

  const selectedVisitorType = visitorTypes.find((t) => t.id === form.visitorTypeId)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/30">
      <header className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <TalusAgLogo />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="w-4 h-4" />
            <span>{locations.find((l) => l.id === selectedLocation)?.name || "Loading..."}</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {mode === "home" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-foreground mb-3">Visitor Check-In</h1>
              <p className="text-lg text-muted-foreground">Welcome to Talus. Please sign in or sign out below.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group"
                onClick={() => setMode("sign-in")}
              >
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <UserPlus className="w-8 h-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Sign In</CardTitle>
                  <CardDescription>New visitor? Sign in here</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" size="lg">
                    Sign In
                  </Button>
                </CardContent>
              </Card>

              <Card
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group"
                onClick={() => setMode("sign-out")}
              >
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4 group-hover:bg-secondary/80 transition-colors">
                    <LogOut className="w-8 h-8 text-foreground" />
                  </div>
                  <CardTitle className="text-2xl">Sign Out</CardTitle>
                  <CardDescription>Leaving? Sign out here</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="secondary" className="w-full" size="lg">
                    Sign Out
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" />
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        )}

        {mode === "sign-in" && (
          <div className="max-w-xl mx-auto">
            <Button variant="ghost" className="mb-6" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Visitor Sign In</CardTitle>
                <CardDescription>Please fill out the form below to sign in</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        required
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        placeholder="John"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input
                        id="lastName"
                        required
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        placeholder="Doe"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="john.doe@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visitorType">Location *</Label>
                    <Select
                      value={form.locationId}
                      onValueChange={(value) => setForm({ ...form, locationId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select visitor type" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            <span className="flex items-center gap-2">
                              {loc.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visitorType">Visitor Type *</Label>
                    <Select
                      value={form.visitorTypeId}
                      onValueChange={(value) => setForm({ ...form, visitorTypeId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select visitor type" />
                      </SelectTrigger>
                      <SelectContent>
                        {visitorTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: type.badge_color }} />
                              {type.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedVisitorType?.requires_company && (
                    <div className="space-y-2">
                      <Label htmlFor="company">Company *</Label>
                      <Input
                        id="company"
                        required={selectedVisitorType.requires_company}
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        placeholder="Company name"
                      />
                    </div>
                  )}

                  {selectedVisitorType?.requires_host && (
                    <div className="space-y-2">
                      <Label htmlFor="host">Who are you visiting? *</Label>
                      <Select value={form.hostId} onValueChange={(value) => setForm({ ...form, hostId: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select host" />
                        </SelectTrigger>
                        <SelectContent>
                          {hosts.map((host) => (
                            <SelectItem key={host.id} value={host.id}>
                              {host.name} {host.department && `(${host.department})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="purpose">Purpose of Visit</Label>
                    <Textarea
                      id="purpose"
                      value={form.purpose}
                      onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                      placeholder="Brief description of your visit"
                      rows={3}
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? "Signing In..." : "Complete Sign In"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "sign-out" && (
          <div className="max-w-md mx-auto">
            <Button variant="ghost" className="mb-6" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Visitor Sign Out</CardTitle>
                <CardDescription>Enter the email you used when signing in</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignOut} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signOutEmail">Email Address</Label>
                    <Input
                      id="signOutEmail"
                      type="email"
                      required
                      value={signOutEmail}
                      onChange={(e) => setSignOutEmail(e.target.value)}
                      placeholder="john.doe@example.com"
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? "Signing Out..." : "Sign Out"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "success" && successData && (
          <div className="max-w-md mx-auto text-center">
            <Card className="border-primary/20">
              <CardContent className="pt-8 pb-8">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-primary" />
                </div>

                <h2 className="text-2xl font-bold mb-2">{successData.type === "in" ? "Welcome!" : "Goodbye!"}</h2>
                <p className="text-lg text-muted-foreground mb-6">{successData.name}</p>

                {successData.type === "in" && (
                  <div className="bg-secondary rounded-lg p-4 mb-6">
                    <p className="text-sm text-muted-foreground mb-1">Your Badge Number</p>
                    <p className="text-3xl font-mono font-bold text-foreground">{successData.badge}</p>
                  </div>
                )}

                <p className="text-sm text-muted-foreground mb-6">
                  {successData.type === "in"
                    ? "Please collect your visitor badge from reception."
                    : "Thank you for visiting Talus!"}
                </p>

                <Button onClick={handleReset} size="lg" className="w-full">
                  Done
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
