"use client"

import { useState } from "react"
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore"
import {
  AdvancedMarker,
  APIProvider,
  Map,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps"

import { db } from "@/lib/firebase"
import type { Library } from "@/lib/libraries"

type NearbyLibrary = {
  id: string
  name: string
  address: string
  distanceMeters: number
}

type AddLibraryFormProps = {
  onLibraryAdded?: (library: Library) => void
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

export function AddLibraryForm({
  onLibraryAdded,
}: AddLibraryFormProps) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [neighborhood, setNeighborhood] =
    useState("")
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [verified, setVerified] = useState(false)

  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)

  const [
    showAdvancedLocation,
    setShowAdvancedLocation,
  ] = useState(false)

  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const [nearbyLibrary, setNearbyLibrary] =
    useState<NearbyLibrary | null>(null)

  const [mapCenter, setMapCenter] = useState({
    lat: 39.0458,
    lng: -77.1224,
  })

  const [mapZoom, setMapZoom] = useState(18)

  const markerLatitude = Number(latitude)
  const markerLongitude = Number(longitude)

  const markerPosition =
    latitude !== "" &&
    longitude !== "" &&
    Number.isFinite(markerLatitude) &&
    Number.isFinite(markerLongitude)
      ? {
          lat: markerLatitude,
          lng: markerLongitude,
        }
      : null

  function handleCameraChanged(
    event: MapCameraChangedEvent,
  ) {
    setMapCenter(event.detail.center)
    setMapZoom(event.detail.zoom)
  }

  async function updateAddressFromCoordinates(
    newLatitude: number,
    newLongitude: number,
  ) {
    try {
      const response = await fetch(
        "/api/reverse-geocode",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            latitude: newLatitude,
            longitude: newLongitude,
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ??
            "Could not find the address.",
        )
      }

      setAddress(data.address ?? "")
      setNeighborhood(data.neighborhood ?? "")

      return true
    } catch (caughtError) {
      console.error(
        "Could not refresh address:",
        caughtError,
      )

      setMessage(
        "The location was updated, but the address could not be refreshed automatically.",
      )

      return false
    }
  }

  async function handleMarkerDragEnd(
    event: google.maps.MapMouseEvent,
  ) {
    const newPosition = event.latLng

    if (!newPosition) {
      return
    }

    const newLatitude = newPosition.lat()
    const newLongitude = newPosition.lng()

    /*
     * These two state updates are essential.
     * They permanently save the dragged marker position,
     * so it does not return to its old location when the
     * map zooms or rerenders.
     */
    setLatitude(newLatitude.toFixed(6))
    setLongitude(newLongitude.toFixed(6))

    setMapCenter({
      lat: newLatitude,
      lng: newLongitude,
    })

    setError("")
    setNearbyLibrary(null)

    const addressUpdated =
      await updateAddressFromCoordinates(
        newLatitude,
        newLongitude,
      )

    if (addressUpdated) {
      setMessage(
        "Library location adjusted. The address and neighborhood were updated automatically. Please confirm them before saving.",
      )
    }
  }

  function useCurrentLocation() {
    setMessage("")
    setError("")
    setNearbyLibrary(null)
    setNeighborhood("")

    if (!navigator.geolocation) {
      setError(
        "Your browser does not support location services.",
      )
      return
    }

    setLocating(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const currentLatitude =
          position.coords.latitude

        const currentLongitude =
          position.coords.longitude

        setLatitude(currentLatitude.toFixed(6))
        setLongitude(currentLongitude.toFixed(6))

        setMapCenter({
          lat: currentLatitude,
          lng: currentLongitude,
        })

        setMapZoom(19)

        const addressUpdated =
          await updateAddressFromCoordinates(
            currentLatitude,
            currentLongitude,
          )

        if (addressUpdated) {
          setMessage(
            "Current location, address, and neighborhood were added. Drag the marker if the GPS position is not exact.",
          )
        }

        setShowAdvancedLocation(false)
        setLocating(false)
      },
      (locationError) => {
        console.error(
          "Could not get current location:",
          locationError,
        )

        switch (locationError.code) {
          case locationError.PERMISSION_DENIED:
            setError(
              "Location permission was denied. Please allow location access and try again.",
            )
            break

          case locationError.POSITION_UNAVAILABLE:
            setError(
              "Your current location is unavailable.",
            )
            break

          case locationError.TIMEOUT:
            setError(
              "The location request timed out. Please try again.",
            )
            break

          default:
            setError(
              "Could not determine your location.",
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

  async function findNearbyLibrary(
    latitudeNumber: number,
    longitudeNumber: number,
  ): Promise<NearbyLibrary | null> {
    const snapshot = await getDocs(
      collection(db, "libraries"),
    )

    let closestLibrary: NearbyLibrary | null = null

    for (const documentSnapshot of snapshot.docs) {
      const data = documentSnapshot.data()

      const existingLatitude = Number(data.latitude)
      const existingLongitude = Number(
        data.longitude,
      )

      if (
        !Number.isFinite(existingLatitude) ||
        !Number.isFinite(existingLongitude)
      ) {
        continue
      }

      const distanceMeters =
        calculateDistanceMeters(
          latitudeNumber,
          longitudeNumber,
          existingLatitude,
          existingLongitude,
        )

      if (
        !closestLibrary ||
        distanceMeters <
          closestLibrary.distanceMeters
      ) {
        closestLibrary = {
          id: documentSnapshot.id,
          name:
            data.name ?? "Unnamed library",
          address: data.address ?? "",
          distanceMeters,
        }
      }
    }

    return closestLibrary
  }

  async function handleSubmit() {
    setMessage("")
    setError("")
    setNearbyLibrary(null)

    const latitudeNumber = Number(latitude)
    const longitudeNumber = Number(longitude)

    if (!name.trim()) {
      setError("Library name is required.")
      return
    }

    if (!address.trim()) {
      setError("Address is required.")
      return
    }

    if (
      !Number.isFinite(latitudeNumber) ||
      latitudeNumber < -90 ||
      latitudeNumber > 90
    ) {
      setError("Enter a valid latitude.")
      return
    }

    if (
      !Number.isFinite(longitudeNumber) ||
      longitudeNumber < -180 ||
      longitudeNumber > 180
    ) {
      setError("Enter a valid longitude.")
      return
    }

    setSaving(true)

    try {
      const closestLibrary =
        await findNearbyLibrary(
          latitudeNumber,
          longitudeNumber,
        )

      const duplicateDistanceMeters = 30

      if (
        closestLibrary &&
        closestLibrary.distanceMeters <=
          duplicateDistanceMeters
      ) {
        setNearbyLibrary(closestLibrary)

        setError(
          `A library already exists about ${Math.round(
            closestLibrary.distanceMeters,
          )} meters from this location.`,
        )

        return
      }

      const libraryName = name.trim()
      const libraryAddress = address.trim()
      const libraryNeighborhood =
        neighborhood.trim()

      const newLibraryReference = await addDoc(
        collection(db, "libraries"),
        {
          name: libraryName,
          address: libraryAddress,
          neighborhood: libraryNeighborhood,

          latitude: latitudeNumber,
          longitude: longitudeNumber,

          books: [],
          bookCount: 0,
          recognitionNotes: "",

          verified,

          lastUpdated: null,
          createdAt: serverTimestamp(),
        },
      )

      const newlyAddedLibrary: Library = {
        id: newLibraryReference.id,
        name: libraryName,
        address: libraryAddress,
        neighborhood: libraryNeighborhood,
        latitude: latitudeNumber,
        longitude: longitudeNumber,
        books: [],
        bookCount: 0,
        lastUpdated: "Not yet inventoried",
        verified,
      }

      onLibraryAdded?.(newlyAddedLibrary)

      setName("")
      setAddress("")
      setNeighborhood("")
      setLatitude("")
      setLongitude("")
      setVerified(false)
      setNearbyLibrary(null)
      setShowAdvancedLocation(false)

      setMapCenter({
        lat: 39.0458,
        lng: -77.1224,
      })

      setMapZoom(18)

      setMessage(
        "Library added successfully. You can now upload its first shelf photo.",
      )
    } catch (caughtError) {
      console.error(
        "Could not add library:",
        caughtError,
      )

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not add the library.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-1">
  <div className="rounded-2xl border border-border bg-card p-5">
         <div className="mt-6 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Library Name
            </span>

            <input
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              className="rounded-xl border border-border bg-background px-3 py-2"
              placeholder="Rockville Town Square Little Library"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Address
            </span>

            <input
              value={address}
              onChange={(event) =>
                setAddress(event.target.value)
              }
              className="rounded-xl border border-border bg-background px-3 py-2"
              placeholder="123 Main St, Rockville, MD"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Neighborhood
            </span>

            <input
              value={neighborhood}
              onChange={(event) =>
                setNeighborhood(event.target.value)
              }
              className="rounded-xl border border-border bg-background px-3 py-2"
              placeholder="Town Center"
            />
          </label>

          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating || saving}
            className="inline-flex w-fit items-center rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {locating
              ? "Finding My Location…"
              : "📍 Use My Current Location"}
          </button>

          {markerPosition && (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-secondary px-4 py-3">
                <p className="text-sm font-medium">
                  Confirm the library location
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Drag the red marker onto the exact
                  position of the library.
                </p>
              </div>

              <div className="h-[320px] w-full">
                <APIProvider
                  apiKey={
                    process.env
                      .NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
                  }
                >
                  <Map
                    center={mapCenter}
                    zoom={mapZoom}
                    onCameraChanged={
                      handleCameraChanged
                    }
                    mapId="DEMO_MAP_ID"
                    gestureHandling="greedy"
                    mapTypeControl={false}
                    streetViewControl={false}
                    fullscreenControl={false}
                  >
                    <AdvancedMarker
                      position={markerPosition}
                      draggable
                      onDragEnd={
                        handleMarkerDragEnd
                      }
                      title="Drag to the exact library location"
                    >
                      <div className="flex flex-col items-center">
                        <div className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                          Library
                        </div>

                        <div className="h-3 w-3 -translate-y-0.5 rotate-45 bg-red-600" />
                      </div>
                    </AdvancedMarker>
                  </Map>
                </APIProvider>
              </div>

              <div className="bg-background px-4 py-3 text-xs text-muted-foreground">
                Dragging the marker automatically
                updates the coordinates, address, and
                neighborhood. The corrected marker
                position will remain after zooming.
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-background">
            <button
              type="button"
              onClick={() =>
                setShowAdvancedLocation(
                  (current) => !current,
                )
              }
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
            >
              <span>
                Advanced location details
              </span>

              <span aria-hidden="true">
                {showAdvancedLocation
                  ? "−"
                  : "+"}
              </span>
            </button>

            {showAdvancedLocation && (
              <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium">
                    Latitude
                  </span>

                  <input
                    value={latitude}
                    onChange={(event) =>
                      setLatitude(
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-border bg-background px-3 py-2"
                    placeholder="39.084013"
                    inputMode="decimal"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">
                    Longitude
                  </span>

                  <input
                    value={longitude}
                    onChange={(event) =>
                      setLongitude(
                        event.target.value,
                      )
                    }
                    className="rounded-xl border border-border bg-background px-3 py-2"
                    placeholder="-77.152812"
                    inputMode="decimal"
                  />
                </label>
              </div>
            )}
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={verified}
              onChange={(event) =>
                setVerified(
                  event.target.checked,
                )
              }
            />

            <span className="text-sm">
              Verified by a KBS volunteer
            </span>
          </label>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || locating}
            className="rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Adding Library…"
              : "Add Library"}
          </button>

          {nearbyLibrary && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">
                Possible duplicate library
              </p>

              <p className="mt-1">
                {nearbyLibrary.name}
              </p>

              {nearbyLibrary.address && (
                <p className="mt-1">
                  {nearbyLibrary.address}
                </p>
              )}

              <p className="mt-1">
                Approximately{" "}
                {Math.round(
                  nearbyLibrary.distanceMeters,
                )}{" "}
                meters away.
              </p>

              <a
                href="/"
                className="mt-3 inline-block font-medium underline"
              >
                View the existing library map
              </a>
            </div>
          )}

          {message && (
            <div
              className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"
              role="status"
            >
              {message}
            </div>
          )}

          {error && (
            <div
              className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>
       </div>
  </div>
)
}