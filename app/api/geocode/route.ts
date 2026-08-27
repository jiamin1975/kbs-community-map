import { NextResponse } from "next/server"

export const runtime = "nodejs"

type GoogleGeocodingResult = {
  formatted_address?: string
  geometry?: {
    location?: {
      lat?: number
      lng?: number
    }
  }
  address_components?: Array<{
    long_name: string
    short_name: string
    types: string[]
  }>
}

type GoogleGeocodingResponse = {
  status: string
  results?: GoogleGeocodingResult[]
  error_message?: string
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_GEOCODING_API_KEY is missing." },
        { status: 500 },
      )
    }

    const body = await request.json()
    const address =
      typeof body.address === "string" ? body.address.trim() : ""

    if (!address) {
      return NextResponse.json(
        { error: "Address is required." },
        { status: 400 },
      )
    }

    const url = new URL(
      "https://maps.googleapis.com/maps/api/geocode/json",
    )
    url.searchParams.set("address", address)
    url.searchParams.set("key", apiKey)

    const response = await fetch(url, {
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: "Google Geocoding request failed." },
        { status: 502 },
      )
    }

    const data =
      (await response.json()) as GoogleGeocodingResponse

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json(
        {
          error:
            data.error_message ??
            "No location was found for this address.",
          status: data.status,
        },
        { status: 404 },
      )
    }

    const bestResult = data.results[0]
    const latitude = bestResult.geometry?.location?.lat
    const longitude = bestResult.geometry?.location?.lng

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return NextResponse.json(
        { error: "Google did not return coordinates for this address." },
        { status: 502 },
      )
    }

    const components = bestResult.address_components ?? []

    function findComponent(acceptedTypes: string[]) {
      return components.find((component) =>
        acceptedTypes.some((type) =>
          component.types.includes(type),
        ),
      )?.long_name
    }

    const neighborhood =
      findComponent(["neighborhood"]) ??
      findComponent(["sublocality"]) ??
      findComponent(["sublocality_level_1"]) ??
      findComponent(["postal_town"]) ??
      findComponent(["locality"]) ??
      findComponent(["administrative_area_level_3"]) ??
      ""

    const city =
      findComponent(["locality"]) ??
      findComponent(["postal_town"]) ??
      findComponent(["administrative_area_level_3"]) ??
      ""

    return NextResponse.json({
      latitude,
      longitude,
      address: bestResult.formatted_address ?? address,
      neighborhood,
      city,
    })
  } catch (error) {
    console.error("Forward geocoding failed:", error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not find this address.",
      },
      { status: 500 },
    )
  }
}
