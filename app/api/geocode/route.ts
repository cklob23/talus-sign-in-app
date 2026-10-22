import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get("address")

    if (!address?.trim()) {
        return NextResponse.json({ error: "Address is required" }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
        return NextResponse.json(
            { error: "Google Maps API key is not configured" },
            { status: 500 }
        )
    }

    try {
        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
        )

        const data = await response.json()

        if (data.status === "OK" && data.results?.length > 0) {
            const result = data.results[0]
            const { lat, lng } = result.geometry.location
            const locationType = result.geometry.location_type

            if (locationType === "APPROXIMATE") {
                return NextResponse.json(
                    {
                        error: "Google only found an approximate point. Type coordinates or use your location instead.",
                        location_type: locationType,
                    },
                    { status: 422 },
                )
            }

            return NextResponse.json({
                lat,
                lng,
                formatted_address: result.formatted_address,
                location_type: locationType, // ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER
            })
        }

        if (data.status === "ZERO_RESULTS") {
            return NextResponse.json({ error: "Address not found" }, { status: 404 })
        }

        console.error("[geocode] Google Maps API error:", data.status, data.error_message)
        return NextResponse.json(
            { error: data.error_message || `Geocoding failed: ${data.status}` },
            { status: 500 }
        )
    } catch (error) {
        console.error("[geocode] Request error:", error)
        return NextResponse.json(
            { error: "Failed to geocode address" },
            { status: 500 }
        )
    }
}
