"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function KioskLocationPicker({
  locations,
  value,
  onChange,
  label,
  disabled,
}: {
  locations: { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
  label?: string
  disabled?: boolean
}) {
  if (locations.length === 0) return null
  return (
    <div className="space-y-2">
      {label ? <Label htmlFor="kiosk-site-picker">{label}</Label> : null}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="kiosk-site-picker" className="min-h-12 w-full text-base">
          <SelectValue placeholder={label || "Site"} />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
