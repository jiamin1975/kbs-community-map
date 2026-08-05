"use client"

import { useState } from "react"
import {
  APIProvider,
  InfoWindow,
  Map,
  Marker,
} from "@vis.gl/react-google-maps"

import { libraries, type Library } from "@/lib/libraries"

type SelectedLibrary = (typeof libraries)[number] | null

type CommunityMapProps = {
  onUploadPhoto: (library: Library) => void
}

export function CommunityMap({
  onUploadPhoto,
}: CommunityMapProps) {

  const [selectedLibrary, setSelectedLibrary] =
    useState<SelectedLibrary>(null)

  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return (
      <div className="mx-auto flex h-[600px] max-w-6xl items-center justify-center px-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="font-medium text-foreground">
            Google Maps API key is missing.
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local,
            then restart the development server.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[600px] w-full">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={{
            lat: 39.0458,
            lng: -77.1224,
          }}
          defaultZoom={11}
          gestureHandling="greedy"
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl
        >
          {libraries.map((library) => (
            <Marker
              key={library.id}
              position={{
                lat: library.latitude,
                lng: library.longitude,
              }}
              title={library.name}
              onClick={() => setSelectedLibrary(library)}
            />
          ))}

          {selectedLibrary && (
            <InfoWindow
              position={{
                lat: selectedLibrary.latitude,
                lng: selectedLibrary.longitude,
              }}
              onCloseClick={() => setSelectedLibrary(null)}
            >
              <div className="w-64 p-1 text-black">
                <h2 className="font-semibold">
                  {selectedLibrary.name}
                </h2>

                {"address" in selectedLibrary && (
                  <p className="mt-1 text-sm">
                    {selectedLibrary.address}
                  </p>
                )}

                <p className="mt-3 text-sm">
                  <strong>Books available:</strong>{" "}
                  {selectedLibrary.bookCount}
                </p>

                <button
                  type="button"
                  onClick={() => onUploadPhoto(selectedLibrary)}
                  className="mt-3 rounded-lg bg-black px-3 py-2 text-sm text-white"
                >
                  Upload Photo
                </button>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  )
}