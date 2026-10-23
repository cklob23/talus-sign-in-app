"use client"

import { Building2, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DASHBOARD_PERIODS, DURATION_UNIT_LABELS, type DurationUnit } from "@/lib/reports/types"

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
          className="text-xs text-primary-text hover:underline"
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
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  locations,
  selectedLocations,
  onLocationsChange,
  visitorTypes,
  selectedVisitorTypes,
  onVisitorTypesChange,
  showVisitorTypes = false,
  previewOpen = false,
  durationUnit,
  onDurationUnitChange,
}: {
  period: string
  onPeriodChange: (value: string) => void
  customStart?: string
  customEnd?: string
  onCustomStartChange?: (value: string) => void
  onCustomEndChange?: (value: string) => void
  locations: FilterOption[]
  selectedLocations: string[]
  onLocationsChange: (next: string[]) => void
  visitorTypes?: FilterOption[]
  selectedVisitorTypes?: string[]
  onVisitorTypesChange?: (next: string[]) => void
  showVisitorTypes?: boolean
  previewOpen?: boolean
  durationUnit?: DurationUnit
  onDurationUnitChange?: (value: DurationUnit) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period} onValueChange={onPeriodChange} open={previewOpen || undefined}>
        <SelectTrigger className="w-40 sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DASHBOARD_PERIODS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {period === "custom" && onCustomStartChange && onCustomEndChange && (
        <div className="flex flex-wrap items-center gap-2">
          <Label className="sr-only" htmlFor="report-custom-start">
            Start date
          </Label>
          <Input
            id="report-custom-start"
            type="date"
            value={customStart || ""}
            onChange={(event) => onCustomStartChange(event.target.value)}
            className="h-9 w-[11.5rem]"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Label className="sr-only" htmlFor="report-custom-end">
            End date
          </Label>
          <Input
            id="report-custom-end"
            type="date"
            value={customEnd || ""}
            onChange={(event) => onCustomEndChange(event.target.value)}
            className="h-9 w-[11.5rem]"
          />
        </div>
      )}
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
      {durationUnit && onDurationUnitChange && (
        <Select value={durationUnit} onValueChange={(value) => onDurationUnitChange(value as DurationUnit)}>
          <SelectTrigger className="w-36 sm:w-40">
            <SelectValue placeholder="Duration" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DURATION_UNIT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                Duration: {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
