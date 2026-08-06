"use client"

import { useEffect, useState } from "react"
import {
  APIProvider,
  InfoWindow,
  Map,
  Marker,
} from "@vis.gl/react-google-maps"

import { subscribeToLibraries } from "@/lib/firestore-libraries"
import type { Library } from "@/lib/libraries"

type CommunityMapProps = {
  onUploadPhoto: (library: Library) => void
}

export function CommunityMap({
  onUploadPhoto,
}: CommunityMapProps) {
  const [libraries, setLibraries] =
    useState<Library[]>([])

  const [selectedLibrary, setSelectedLibrary] =
    useState<Library | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    const unsubscribe = subscribeToLibraries(
      (results) => {
        setLibraries(results)
        setLoading(false)
      },
      (caughtError) => {
        console.error(caughtError)
        setError(caughtError.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!selectedLibrary) {
      return
    }

    const updatedLibrary = libraries.find(
      (library) =>
        library.id === selectedLibrary.id,
    )

    if (updatedLibrary) {
      setSelectedLibrary(updatedLibrary)
    } else {
      setSelectedLibrary(null)
    }
  }, [libraries, selectedLibrary?.id])

  if (!apiKey) {
    return (
      <div className="mx-auto flex h-[600px] max-w-6xl items-center justify-center px-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="font-medium text-foreground">
            Google Maps API key is missing.
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to
            .env.local, then restart the development
            server.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center">
        <p className="text-muted-foreground">
          Loading libraries…
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-[600px] items-center justify-center p-6">
        <p className="text-red-600">
          Could not load libraries: {error}
        </p>
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
          {libraries
            .filter(
              (library) =>
                Number.isFinite(
                  library.latitude,
                ) &&
                Number.isFinite(
                  library.longitude,
                ),
            )
            .map((library) => (
              <Marker
                key={library.id}
                position={{
                  lat: library.latitude,
                  lng: library.longitude,
                }}
                title={library.name}
                onClick={() =>
                  setSelectedLibrary(library)
                }
              />
            ))}

          {selectedLibrary && (
            <InfoWindow
              position={{
                lat: selectedLibrary.latitude,
                lng: selectedLibrary.longitude,
              }}
              onCloseClick={() =>
                setSelectedLibrary(null)
              }
            >
              <div className="w-64 p-1 text-black">
                <h2 className="font-semibold">
                  {selectedLibrary.name}
                </h2>

                {selectedLibrary.address && (
                  <p className="mt-1 text-sm">
                    {selectedLibrary.address}
                  </p>
                )}

                <p className="mt-3 text-sm">
                  <strong>
                    Books available:
                  </strong>{" "}
                  {selectedLibrary.bookCount}
                </p>

                <div className="mt-4">
                  <p className="text-sm font-semibold">
                    Current Inventory
                  </p>

                  {selectedLibrary.books.length ===
                  0 ? (
                    <p className="mt-2 text-sm text-gray-500">
                      No books have been
                      inventoried yet.
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1 text-sm">
                      {selectedLibrary.books.map(
                        (book, index) => {
                          const title =
                            typeof book ===
                            "string"
                              ? book
                              : typeof book ===
                                    "object" &&
                                  book !== null &&
                                  "title" in book
                                ? String(
                                    book.title,
                                  )
                                : "Untitled book"

                          const author =
                            typeof book ===
                              "object" &&
                            book !== null &&
                            "author" in book &&
                            book.author
                              ? String(
                                  book.author,
                                )
                              : null

                          return (
                            <li
                              key={`${title}-${index}`}
                              className="rounded-lg bg-gray-100 px-3 py-2"
                            >
                              <p className="font-medium">
                                {title}
                              </p>

                              {author && (
                                <p className="mt-0.5 text-xs text-gray-600">
                                  {author}
                                </p>
                              )}
                            </li>
                          )
                        },
                      )}
                    </ul>
                  )}
                </div>

                <p className="mt-3 text-xs text-gray-500">
                  Updated{" "}
                  {selectedLibrary.lastUpdated}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    onUploadPhoto(
                      selectedLibrary,
                    )
                  }
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