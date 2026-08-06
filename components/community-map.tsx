"use client"

import { useEffect, useState } from "react"
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map,
  Marker,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps"

import { subscribeToLibraries } from "@/lib/firestore-libraries"
import type { Library } from "@/lib/libraries"

type CommunityMapProps = {
  onUploadPhoto: (library: Library) => void
}

type NearbyLibraryMatch = {
  library: Library
  distanceMeters: number
}

function calculateDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
) {
  const earthRadiusMeters = 6_371_000

  const toRadians = (degrees: number) =>
    (degrees * Math.PI) / 180

  const latitudeDifference = toRadians(
    latitude2 - latitude1,
  )

  const longitudeDifference = toRadians(
    longitude2 - longitude1,
  )

  const firstLatitude = toRadians(latitude1)
  const secondLatitude = toRadians(latitude2)

  const haversineValue =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2

  const angularDistance =
    2 *
    Math.atan2(
      Math.sqrt(haversineValue),
      Math.sqrt(1 - haversineValue),
    )

  return earthRadiusMeters * angularDistance
}



export function CommunityMap({
  onUploadPhoto,
}: CommunityMapProps) {
  const [libraries, setLibraries] =
    useState<Library[]>([])

  const [selectedLibrary, setSelectedLibrary] =
    useState<Library | null>(null)

  const [nearbyMatch, setNearbyMatch] =
    useState<NearbyLibraryMatch | null>(null)

  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState("")
  const [locationError, setLocationError] =
    useState("")

  const [mapCenter, setMapCenter] = useState({
    lat: 39.0458,
    lng: -77.1224,
  })

  const [mapZoom, setMapZoom] = useState(11)

  function handleCameraChanged(
  event: MapCameraChangedEvent,
) {
  setMapCenter(event.detail.center)
  setMapZoom(event.detail.zoom)
}

  const [userLocation, setUserLocation] = useState<{
    lat: number
    lng: number
  } | null>(null)

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

  function findNearbyLibrary() {
    setLocationError("")
    setNearbyMatch(null)
    setSelectedLibrary(null)

    if (!navigator.geolocation) {
      setLocationError(
        "Your browser does not support location services.",
      )
      return
    }

    if (libraries.length === 0) {
      setLocationError(
        "No libraries are currently available.",
      )
      return
    }

    setLocating(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLatitude =
          position.coords.latitude
        const currentLongitude =
          position.coords.longitude

        setUserLocation({
          lat: currentLatitude,
          lng: currentLongitude,
        })

        const validLibraries = libraries.filter(
          (library) =>
            Number.isFinite(library.latitude) &&
            Number.isFinite(library.longitude),
        )

        if (validLibraries.length === 0) {
          setLocationError(
            "No libraries with valid locations were found.",
          )
          setLocating(false)
          return
        }

        const matches = validLibraries
          .map((library) => ({
            library,
            distanceMeters:
              calculateDistanceMeters(
                currentLatitude,
                currentLongitude,
                library.latitude,
                library.longitude,
              ),
          }))
          .sort(
            (first, second) =>
              first.distanceMeters -
              second.distanceMeters,
          )

        const closestMatch = matches[0]

        if (closestMatch.distanceMeters > 150) {
          setLocationError(
            `No library was found within 150 meters. The closest library is about ${Math.round(
              closestMatch.distanceMeters,
            )} meters away.`,
          )

          setMapCenter({
            lat: currentLatitude,
            lng: currentLongitude,
          })

          setMapZoom(17)
          setLocating(false)
          return
        }

        setNearbyMatch(closestMatch)

        // Keep the normal white InfoWindow closed so
        // both the red and blue markers stay visible.
        setSelectedLibrary(null)

        setMapCenter({
          lat: closestMatch.library.latitude,
          lng: closestMatch.library.longitude,
        })

        setMapZoom(18)
        setLocating(false)
      },
      (geolocationError) => {
        console.error(
          "Could not get current location:",
          geolocationError,
        )

        switch (geolocationError.code) {
          case geolocationError.PERMISSION_DENIED:
            setLocationError(
              "Location permission was denied. Please allow location access and try again.",
            )
            break

          case geolocationError.POSITION_UNAVAILABLE:
            setLocationError(
              "Your current location is unavailable.",
            )
            break

          case geolocationError.TIMEOUT:
            setLocationError(
              "Finding your location took too long. Please try again.",
            )
            break

          default:
            setLocationError(
              "Could not determine your current location.",
            )
        }

        setLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    )
  }

  function confirmNearbyLibrary() {
    if (!nearbyMatch) {
      return
    }

    onUploadPhoto(nearbyMatch.library)
    setNearbyMatch(null)
  }

  function cancelNearbyLibrary() {
    setNearbyMatch(null)
    setSelectedLibrary(null)
  }

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
    <div>
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={findNearbyLibrary}
          disabled={locating}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {locating
            ? "Finding Nearby Library…"
            : "📍 Update a Nearby Library"}
        </button>

        {locationError && (
          <div
            className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {locationError}
          </div>
        )}
      </div>

      <div className="relative h-[600px] w-full">
        <APIProvider apiKey={apiKey}>
          <Map
            center={mapCenter}
            zoom={mapZoom}
            onCameraChanged={handleCameraChanged}
            mapId="DEMO_MAP_ID"
            gestureHandling="greedy"
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl
          >
            {userLocation && (
              <AdvancedMarker
                position={userLocation}
                title="You are here"
                zIndex={1000}
              >
                <div className="relative flex size-8 items-center justify-center">
                  <span className="absolute size-8 animate-ping rounded-full bg-blue-500 opacity-40" />

                  <span className="relative size-4 rounded-full border-2 border-white bg-blue-600 shadow-lg" />
                </div>
              </AdvancedMarker>
            )}

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
                  onClick={() => {
                    setSelectedLibrary(library)
                    setNearbyMatch(null)
                    setLocationError("")

                    setMapCenter({
                      lat: library.latitude,
                      lng: library.longitude,
                    })
                  }}
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

        {nearbyMatch && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-blue-300 bg-white/95 p-4 text-blue-950 shadow-xl backdrop-blur sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2">
            <p className="text-sm font-semibold">
              Nearest library found
            </p>

            <p className="mt-1 text-lg font-semibold">
              {nearbyMatch.library.name}
            </p>

            {nearbyMatch.library.address && (
              <p className="mt-1 text-sm">
                {nearbyMatch.library.address}
              </p>
            )}

            <p className="mt-2 text-sm">
              Approximately{" "}
              <strong>
                {Math.round(
                  nearbyMatch.distanceMeters,
                )}{" "}
                meters
              </strong>{" "}
              from your current location.
            </p>

            <p className="mt-2 text-sm">
              Confirm that the red library marker
              matches the blue “You are here” dot.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={confirmNearbyLibrary}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Yes, Update This Library
              </button>

              <button
                type="button"
                onClick={cancelNearbyLibrary}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium"
              >
                Choose Another Library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}