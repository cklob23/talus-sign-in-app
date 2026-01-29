"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin, Users, Briefcase, Building2 } from "lucide-react"

interface LocationWithStats {
    id: string
    name: string
    address: string | null
    latitude: number | null
    longitude: number | null
    currentVisitors: number
    currentEmployees: number
}

interface LocationMapProps {
    locations: LocationWithStats[]
}

export function LocationMap({ locations }: LocationMapProps) {
    const mapRef = useRef<HTMLDivElement>(null)
    const mapInstanceRef = useRef<unknown>(null)
    const initializingRef = useRef(false)
    const [isMapLoaded, setIsMapLoaded] = useState(false)
    const [selectedLocation, setSelectedLocation] = useState<LocationWithStats | null>(null)

    // Filter locations with valid coordinates
    const locationsWithCoords = locations.filter(
        (loc) => loc.latitude !== null && loc.longitude !== null
    )

    useEffect(() => {
        // Add Leaflet CSS via link tag
        const linkId = "leaflet-css"
        if (!document.getElementById(linkId)) {
            const link = document.createElement("link")
            link.id = linkId
            link.rel = "stylesheet"
            link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
            document.head.appendChild(link)
        }

        // Add custom styles to fix z-index issues with navigation
        const styleId = "leaflet-zindex-fix"
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style")
            style.id = styleId
            style.textContent = `
        .leaflet-pane,
        .leaflet-tile,
        .leaflet-marker-icon,
        .leaflet-marker-shadow,
        .leaflet-tile-container,
        .leaflet-map-pane,
        .leaflet-overlay-pane,
        .leaflet-shadow-pane,
        .leaflet-marker-pane,
        .leaflet-tooltip-pane,
        .leaflet-popup-pane,
        .leaflet-control {
          z-index: 0 !important;
        }
        .leaflet-top,
        .leaflet-bottom {
          z-index: 1 !important;
        }
      `
            document.head.appendChild(style)
        }
    }, [])


    useEffect(() => {
        if (typeof window === "undefined" || !mapRef.current) return
        if (mapInstanceRef.current || initializingRef.current) return

        initializingRef.current = true

        const initMap = async () => {
            const L = (await import("leaflet")).default

            // Double check the container isn't already initialized
            if (mapRef.current && (mapRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) {
                initializingRef.current = false
                return
            }

            // Create map with satellite view
            const map = L.map(mapRef.current!, {
                center: [39.8283, -98.5795], // US center
                zoom: 4,
                zoomControl: true,
            })

            // Add satellite tile layer (using ESRI World Imagery - free)
            L.tileLayer(
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                {
                    attribution: "Tiles &copy; Esri",
                    maxZoom: 19,
                }
            ).addTo(map)

            // Add labels overlay for readability
            L.tileLayer(
                "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
                {
                    maxZoom: 19,
                }
            ).addTo(map)

            // Custom icon for markers
            const createIcon = (visitors: number, employees: number) => {
                const total = visitors + employees
                const size = Math.min(60, Math.max(36, 36 + total * 2))
                const color = total > 10 ? "#ef4444" : total > 5 ? "#f97316" : "#22c55e"

                return L.divIcon({
                    className: "custom-marker",
                    html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            border: 3px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: ${size > 40 ? "16px" : "14px"};
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            cursor: pointer;
          ">
            ${total}
          </div>
        `,
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2],
                })
            }

            // Add markers for each location
            locationsWithCoords.forEach((location) => {
                const marker = L.marker([location.latitude!, location.longitude!], {
                    icon: createIcon(location.currentVisitors, location.currentEmployees),
                }).addTo(map)

                // Create popup content
                const popupContent = `
        <div style="min-width: 200px; padding: 8px;">
          <h3 style="font-weight: bold; font-size: 16px; margin-bottom: 8px; color: #111;">${location.name}</h3>
          ${location.address ? `<p style="font-size: 12px; color: #666; margin-bottom: 12px;">${location.address}</p>` : ""}
          <div style="display: flex; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; background: #3b82f6; border-radius: 50%;"></span>
              <span style="font-size: 14px; color: #333;"><strong>${location.currentVisitors}</strong> Visitors</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%;"></span>
              <span style="font-size: 14px; color: #333;"><strong>${location.currentEmployees}</strong> Employees</span>
            </div>
          </div>
        </div>
      `

                marker.bindPopup(popupContent, {
                    closeButton: true,
                    className: "custom-popup",
                })

                marker.on("click", () => {
                    setSelectedLocation(location)
                })
            })

            // Fit bounds if we have multiple locations
            if (locationsWithCoords.length > 1) {
                const bounds = L.latLngBounds(
                    locationsWithCoords.map((l) => [l.latitude!, l.longitude!])
                )
                map.fitBounds(bounds, { padding: [50, 50] })
            }

            mapInstanceRef.current = map
            setIsMapLoaded(true)
            initializingRef.current = false
        }

        initMap()

        return () => {
            if (mapInstanceRef.current) {
                try {
                    (mapInstanceRef.current as { remove: () => void }).remove()
                } catch {
                    // Ignore removal errors
                }
                mapInstanceRef.current = null
                initializingRef.current = false
            }
        }
    }, [locationsWithCoords])

    const totalVisitors = locations.reduce((sum, l) => sum + l.currentVisitors, 0)
    const totalEmployees = locations.reduce((sum, l) => sum + l.currentEmployees, 0)

    return (
        <Card className="col-span-full">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <MapPin className="w-5 h-5" />
                        Location Overview
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            <span className="text-muted-foreground">{totalVisitors} Total Visitors</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                            <span className="text-muted-foreground">{totalEmployees} Total Employees</span>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="relative">
                    {/* Map container */}
                    <div
                        ref={mapRef}
                        className="w-full h-[400px] rounded-b-lg"
                        style={{ background: "#1a1a2e" }}
                    />

                    {!isMapLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-b-lg">
                            <div className="text-center">
                                <div className="animate-pulse text-muted-foreground">Loading map...</div>
                            </div>
                        </div>
                    )}

                    {locationsWithCoords.length === 0 && isMapLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-b-lg">
                            <div className="text-center p-6">
                                <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                                <p className="text-muted-foreground">No locations with coordinates found.</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Add latitude and longitude to your locations to see them on the map.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Location stats sidebar */}
                    {locationsWithCoords.length > 0 && (
                        <div className="absolute bottom-6 right-2 bg-background/95 backdrop-blur rounded-lg shadow-lg p-3 max-w-[200px] max-h-[350px] overflow-y-auto">
                            <h4 className="font-semibold text-sm mb-2">Locations</h4>
                            <div className="space-y-2">
                                {locations.map((loc) => (
                                    <div
                                        key={loc.id}
                                        className={`p-2 rounded-md text-xs cursor-pointer transition-colors ${selectedLocation?.id === loc.id
                                                ? "bg-primary/10 border border-primary"
                                                : "bg-muted/50 hover:bg-muted"
                                            }`}
                                        onClick={() => {
                                            if (loc.latitude && loc.longitude && mapInstanceRef.current) {
                                                (mapInstanceRef.current as import("leaflet").Map).setView([loc.latitude!, loc.longitude!], 14)
                                                setSelectedLocation(loc)
                                            }
                                        }}
                                    >
                                        <p className="font-medium truncate">{loc.name}</p>
                                        <div className="flex gap-3 mt-1 text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {loc.currentVisitors}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Briefcase className="w-3 h-3" />
                                                {loc.currentEmployees}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
