"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, CheckCircle, Siren } from "lucide-react"
import type { Evacuation, SignIn } from "@/types/database"

export default function EvacuationsPage() {
  const [evacuations, setEvacuations] = useState<Evacuation[]>([])
  const [currentVisitors, setCurrentVisitors] = useState<SignIn[]>([])
  const [activeEvacuation, setActiveEvacuation] = useState<Evacuation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [reason, setReason] = useState("")

  async function loadData() {
    setIsLoading(true)
    const supabase = createClient()

    const [{ data: evacData }, { data: visitorsData }] = await Promise.all([
      supabase.from("evacuations").select("*, location:locations(*)").order("started_at", { ascending: false }),
      supabase.from("sign_ins").select("*, visitor:visitors(*), host:hosts(*)").is("sign_out_time", null),
    ])

    if (evacData) {
      setEvacuations(evacData as Evacuation[])
      const active = evacData.find((e) => !e.all_clear)
      setActiveEvacuation(active || null)
    }
    if (visitorsData) setCurrentVisitors(visitorsData as SignIn[])
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleStartEvacuation(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    const { data: locations } = await supabase.from("locations").select("id").limit(1)
    if (!locations || locations.length === 0) return

    await supabase.from("evacuations").insert({
      location_id: locations[0].id,
      reason: reason || null,
    })

    setReason("")
    setIsDialogOpen(false)
    loadData()
  }

  async function handleEndEvacuation() {
    if (!activeEvacuation) return
    const supabase = createClient()
    await supabase
      .from("evacuations")
      .update({
        all_clear: true,
        ended_at: new Date().toISOString(),
      })
      .eq("id", activeEvacuation.id)
    loadData()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Evacuations</h1>
          <p className="text-muted-foreground">Emergency evacuation management</p>
        </div>
        {activeEvacuation ? (
          <Button variant="destructive" onClick={handleEndEvacuation} className="bg-destructive">
            <CheckCircle className="w-4 h-4 mr-2" />
            End Evacuation - All Clear
          </Button>
        ) : (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="bg-destructive">
                <Siren className="w-4 h-4 mr-2" />
                Start Evacuation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  Start Emergency Evacuation
                </DialogTitle>
                <DialogDescription>
                  This will alert all staff and generate an evacuation list of all visitors currently on-site.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleStartEvacuation} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Input
                    id="reason"
                    placeholder="e.g., Fire drill, gas leak, etc."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="destructive" className="bg-destructive">
                    Confirm Evacuation
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {activeEvacuation && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Siren className="w-5 h-5 animate-pulse" />
              EVACUATION IN PROGRESS
            </CardTitle>
            <CardDescription>
              Started {new Date(activeEvacuation.started_at).toLocaleString()}
              {activeEvacuation.reason && ` - ${activeEvacuation.reason}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <h3 className="font-semibold mb-4">Visitors to Account For ({currentVisitors.length})</h3>
            {currentVisitors.length === 0 ? (
              <p className="text-muted-foreground">No visitors currently on-site</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {currentVisitors.map((visitor) => (
                  <div key={visitor.id} className="flex items-center gap-3 p-3 bg-background rounded-lg border">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
                      {visitor.visitor?.first_name?.[0]}
                      {visitor.visitor?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="font-medium">
                        {visitor.visitor?.first_name} {visitor.visitor?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">Badge: {visitor.badge_number}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Evacuation History</CardTitle>
          <CardDescription>Past evacuation events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : evacuations.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No evacuation records</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evacuations.map((evac) => (
                  <TableRow key={evac.id}>
                    <TableCell>{new Date(evac.started_at).toLocaleString()}</TableCell>
                    <TableCell>{evac.reason || "-"}</TableCell>
                    <TableCell>
                      {evac.ended_at
                        ? `${Math.round((new Date(evac.ended_at).getTime() - new Date(evac.started_at).getTime()) / (1000 * 60))} min`
                        : "Ongoing"}
                    </TableCell>
                    <TableCell>
                      {evac.all_clear ? (
                        <Badge variant="secondary">All Clear</Badge>
                      ) : (
                        <Badge variant="destructive" className="bg-destructive text-destructive-foreground">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
