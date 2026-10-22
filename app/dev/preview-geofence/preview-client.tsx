"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Crosshair, MapPin, Search } from "lucide-react"

export function PreviewGeofenceScreens({ screen }: { screen?: string }) {
  const only = screen?.trim() || "all"
  const show = (id: string) => only === "all" || only === id

  return (
    <div className="min-h-screen space-y-16 bg-[#eef4f0] p-6">
      {show("location-edit") ? (
        <section id="location-edit" className="mx-auto max-w-lg">
          <Dialog open>
            <DialogContent className="max-w-[95vw] sm:max-w-lg" data-testid="location-edit-dialog">
              <DialogHeader>
                <DialogTitle className="text-lg">Edit Location</DialogTitle>
                <DialogDescription className="text-sm">Update location details</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="preview-name">Name *</Label>
                  <Input id="preview-name" value="Test Location" readOnly />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preview-address">Address</Label>
                  <div className="flex gap-2">
                    <Input id="preview-address" value="220 Oak Hill Dr, Rockmart, GA" readOnly />
                    <Button type="button" variant="outline" className="shrink-0">
                      <Search className="w-4 h-4" />
                      <span className="ml-1.5 hidden sm:inline">Look up address</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Looking up an address only fills coordinates when you click the button. Saving never overwrites a GPS or typed point.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Enforce on-site check</Label>
                    <p className="text-xs text-muted-foreground">
                      Off only when you turn this switch off. A blank radius uses 500 m.
                    </p>
                  </div>
                  <Switch checked />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preview-radius">On-site radius</Label>
                  <Input id="preview-radius" value="200" readOnly />
                  <p className="text-xs text-muted-foreground">
                    200 m. Allowed range 25 m to 5 km. Used for QR and kiosk sign-in.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Coordinates</Label>
                    <Button type="button" variant="outline" size="sm">
                      <Crosshair className="w-3.5 h-3.5 mr-1.5" />
                      Use My Location
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Latitude</Label>
                      <Input value="34.0113025" readOnly />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Longitude</Label>
                      <Input value="-85.0682674" readOnly />
                    </div>
                  </div>
                  <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-sm">
                    <p className="font-medium flex items-center gap-1 text-green-700">
                      <MapPin className="w-3.5 h-3.5" />
                      Coordinates Set
                    </p>
                    <p className="text-xs text-green-600 font-mono mt-0.5">34.0113025, -85.0682674</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button">Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      ) : null}

      {show("kiosk-blocked") ? (
        <section id="kiosk-blocked" className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
          <div className="mb-6 rounded-xl border border-[#fff3df] bg-[#fff3df] p-4">
            <p className="font-medium text-[#8a4500]">Sign in is paused. Please ask reception.</p>
            <div className="mt-2 space-y-2 text-sm text-[#8a4500]">
              <p>This kiosk is about 76.2 km from Test Location. Sign-in only works within 200 m.</p>
              <Button type="button" variant="outline" className="min-h-12">
                Allow sign-in anyway
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
