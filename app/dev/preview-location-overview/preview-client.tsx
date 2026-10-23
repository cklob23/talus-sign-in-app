"use client"

import { LocationMap } from "@/components/admin/location-map"

const MOCK_LOCATIONS = [
  {
    id: "all-sites-preview",
    name: "Boone Site",
    address: "Boone, NC",
    latitude: 36.2168,
    longitude: -81.6746,
    currentVisitors: 3,
    currentEmployees: 2,
  },
  {
    id: "houston",
    name: "Houston HQ",
    address: "Houston, TX",
    latitude: 29.7604,
    longitude: -95.3698,
    currentVisitors: 5,
    currentEmployees: 4,
  },
  {
    id: "rockmart",
    name: "Rockmart Site",
    address: "Rockmart, GA",
    latitude: 34.0023,
    longitude: -85.0494,
    currentVisitors: 1,
    currentEmployees: 1,
  },
]

export function PreviewLocationOverview() {
  return (
    <main className="min-h-screen space-y-8 bg-[#eef4f0] p-4">
      <section className="space-y-2">
        <h1 className="text-sm font-semibold uppercase tracking-wide text-[#55625a]">
          Location Overview at 427 CSS px
        </h1>
        <div className="overflow-hidden rounded-xl border bg-white shadow" style={{ width: 427 }}>
          <LocationMap locations={MOCK_LOCATIONS} />
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#55625a]">
          Location Overview at 800 CSS px
        </h2>
        <div className="overflow-hidden rounded-xl border bg-white shadow" style={{ width: 800 }}>
          <LocationMap locations={MOCK_LOCATIONS} />
        </div>
      </section>
    </main>
  )
}
