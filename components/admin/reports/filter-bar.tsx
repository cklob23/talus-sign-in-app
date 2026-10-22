"use client"

import { Building2, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface FilterOption {
  id: string
  name: string
}

function MultiFilter({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  emptyLabel,
}: {
  label: string
  icon: typeof Building2
  options: FilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
  emptyLabel: string
}) {
  const summary =
    selected.length === 0
      ? emptyLabel
      : selected.length === 1
        ? options.find((opt) => opt.id === selected[0])?.name || label
        : `${selected.length} ${label.toLowerCase()}`

  function toggle(id: string, checked: boolean) {
    if (checked) onChange([...selected, id])
    else onChange(selected.filter((item) => item !== id))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start">
          <Icon className="w-4 h-4 mr-2" />
          {summary}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-2" align="start">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => onChange([])}
        >
          All {label.toLowerCase()}
        </button>
        <div className="max-h-56 overflow-y-auto space-y-2">
          {options.map((opt) => (
            <Label key={opt.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={selected.includes(opt.id)}
                onCheckedChange={(checked) => toggle(opt.id, checked === true)}
              />
              <span className="truncate">{opt.name}</span>
            </Label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ReportFilterBar({
  period,
  onPeriodChange,
  locations,
  selectedLocations,
  onLocationsChange,
  visitorTypes,
  selectedVisitorTypes,
  onVisitorTypesChange,
  showVisitorTypes = false,
}: {
  period: string
  onPeriodChange: (value: string) => void
  locations: FilterOption[]
  selectedLocations: string[]
  onLocationsChange: (next: string[]) => void
  visitorTypes?: FilterOption[]
  selectedVisitorTypes?: string[]
  onVisitorTypesChange?: (next: string[]) => void
  showVisitorTypes?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period} onValueChange={onPeriodChange}>
        <SelectTrigger className="w-36 sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Last 24 hours</SelectItem>
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="14">Last 14 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
        </SelectContent>
      </Select>
      <MultiFilter
        label="Sites"
        icon={Building2}
        options={locations}
        selected={selectedLocations}
        onChange={onLocationsChange}
        emptyLabel="All sites"
      />
      {showVisitorTypes && visitorTypes && onVisitorTypesChange && selectedVisitorTypes && (
        <MultiFilter
          label="Visitor types"
          icon={Tags}
          options={visitorTypes}
          selected={selectedVisitorTypes}
          onChange={onVisitorTypesChange}
          emptyLabel="All types"
        />
      )}
    </div>
  )
}
