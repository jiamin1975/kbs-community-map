"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map,
  Marker,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps";
import { getDownloadURL, ref } from "firebase/storage";

import { subscribeToLibraries } from "@/lib/firestore-libraries";
import { storage } from "@/lib/firebase";
import type { Library } from "@/lib/libraries";

type CommunityMapProps = {
  onUploadPhoto: (library: Library) => void;
  onAddLibrary: () => void;
  focusedLibrary?: Library | null;
};

type NearbyLibraryMatch = {
  library: Library;
  distanceMeters: number;
};

function calculateDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
) {
  const earthRadiusMeters = 6_371_000;

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const latitudeDifference = toRadians(latitude2 - latitude1);

  const longitudeDifference = toRadians(longitude2 - longitude1);

  const firstLatitude = toRadians(latitude1);
  const secondLatitude = toRadians(latitude2);

  const haversineValue =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  const angularDistance =
    2 * Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue));

  return earthRadiusMeters * angularDistance;
}

export function CommunityMap({
  onUploadPhoto,
  onAddLibrary,
  focusedLibrary,
}: CommunityMapProps) {
  const [libraries, setLibraries] = useState<Library[]>([]);

  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null);

  const [nearbyMatch, setNearbyMatch] = useState<NearbyLibraryMatch | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");

  const [mapCenter, setMapCenter] = useState({
    lat: 39.0458,
    lng: -77.1224,
  });

  const [mapZoom, setMapZoom] = useState(11);

  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [libraryPhotoUrl, setLibraryPhotoUrl] = useState<string | null>(null);

  const [photoLoading, setPhotoLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [isBookSearchOpen, setIsBookSearchOpen] = useState(false);
  const bookSearchAreaRef = useRef<HTMLDivElement>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const bookSearchResults = useMemo(() => {
    const normalizedQuery = bookSearchQuery.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return libraries
      .flatMap((library) =>
        library.books.map((book, index) => {
          const title =
            typeof book === "string"
              ? book
              : typeof book === "object" &&
                  book !== null &&
                  "title" in book
                ? String(book.title)
                : "Untitled book";

          const author =
            typeof book === "object" &&
            book !== null &&
            "author" in book &&
            book.author
              ? String(book.author)
              : null;

          return {
            library,
            title,
            author,
            key: `${library.id}-${title}-${index}`,
          };
        }),
      )
      .filter(
        ({ title, author }) =>
          title.toLocaleLowerCase().includes(normalizedQuery) ||
          author?.toLocaleLowerCase().includes(normalizedQuery),
      )
      .sort((firstResult, secondResult) =>
        firstResult.title.localeCompare(secondResult.title),
      );
  }, [bookSearchQuery, libraries]);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 639px)");

    const updateMobileState = () => setIsMobile(mobileQuery.matches);

    updateMobileState();
    mobileQuery.addEventListener("change", updateMobileState);

    return () => mobileQuery.removeEventListener("change", updateMobileState);
  }, []);

  useEffect(() => {
    function closeBookSearchWhenClickingOutside(event: PointerEvent) {
      if (
        bookSearchAreaRef.current &&
        !bookSearchAreaRef.current.contains(event.target as Node)
      ) {
        setIsBookSearchOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeBookSearchWhenClickingOutside);

    return () =>
      document.removeEventListener(
        "pointerdown",
        closeBookSearchWhenClickingOutside,
      );
  }, []);

  function handleCameraChanged(event: MapCameraChangedEvent) {
    setMapCenter(event.detail.center);
    setMapZoom(event.detail.zoom);
  }

  useEffect(() => {
    const unsubscribe = subscribeToLibraries(
      (results) => {
        setLibraries(results);
        setLoading(false);
      },
      (caughtError) => {
        console.error(caughtError);
        setError(caughtError.message);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedLibrary) {
      return;
    }

    const updatedLibrary = libraries.find(
      (library) => library.id === selectedLibrary.id,
    );

    if (updatedLibrary) {
      setSelectedLibrary(updatedLibrary);
    }
  }, [libraries, selectedLibrary?.id]);

  /*
   * After a new library is created, center the map on
   * it and keep its information card open. Firestore's
   * live subscription may update a moment later, so use
   * the newly created object immediately.
   */
  useEffect(() => {
    if (!focusedLibrary) {
      return;
    }

    setSelectedLibrary(focusedLibrary);
    setNearbyMatch(null);
    setLocationError("");
    setLibraryPhotoUrl(null);

    setMapCenter({
      lat: focusedLibrary.latitude,
      lng: focusedLibrary.longitude,
    });

    setMapZoom(19);
  }, [focusedLibrary]);

  /*
   * Whenever a library is selected, check Firestore's
   * photoFile field and load the corresponding file
   * from Firebase Storage.
   */
  useEffect(() => {
    let cancelled = false;

    async function loadLibraryPhoto() {
      setLibraryPhotoUrl(null);

      if (!selectedLibrary?.photoFile) {
        setPhotoLoading(false);
        return;
      }

      setPhotoLoading(true);

      try {
        const photoReference = ref(
          storage,
          `library-photos/${selectedLibrary.photoFile}`,
        );

        const url = await getDownloadURL(photoReference);

        if (!cancelled) {
          setLibraryPhotoUrl(url);
        }
      } catch (caughtError) {
        console.error("Could not load library photo:", caughtError);

        if (!cancelled) {
          setLibraryPhotoUrl(null);
        }
      } finally {
        if (!cancelled) {
          setPhotoLoading(false);
        }
      }
    }

    loadLibraryPhoto();

    return () => {
      cancelled = true;
    };
  }, [selectedLibrary?.id, selectedLibrary?.photoFile]);

  function findNearbyLibrary() {
    setLocationError("");
    setNearbyMatch(null);
    setSelectedLibrary(null);

    if (!navigator.geolocation) {
      setLocationError("Your browser does not support location services.");
      return;
    }

    if (libraries.length === 0) {
      setLocationError("No libraries are currently available.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLatitude = position.coords.latitude;

        const currentLongitude = position.coords.longitude;

        setUserLocation({
          lat: currentLatitude,
          lng: currentLongitude,
        });

        const validLibraries = libraries.filter(
          (library) =>
            Number.isFinite(library.latitude) &&
            Number.isFinite(library.longitude),
        );

        if (validLibraries.length === 0) {
          setLocationError("No libraries with valid locations were found.");

          setLocating(false);
          return;
        }

        const matches = validLibraries
          .map((library) => ({
            library,
            distanceMeters: calculateDistanceMeters(
              currentLatitude,
              currentLongitude,
              library.latitude,
              library.longitude,
            ),
          }))
          .sort(
            (first, second) => first.distanceMeters - second.distanceMeters,
          );

        const closestMatch = matches[0];

        if (closestMatch.distanceMeters > 150) {
          setLocationError(
            `No library was found within 150 meters. The closest library is about ${Math.round(
              closestMatch.distanceMeters,
            )} meters away.`,
          );

          setMapCenter({
            lat: currentLatitude,
            lng: currentLongitude,
          });

          setMapZoom(17);
          setLocating(false);
          return;
        }

        setNearbyMatch(closestMatch);

        /*
         * Keep the normal InfoWindow closed
         * while confirming the nearby library.
         */
        setSelectedLibrary(null);

        setMapCenter({
          lat: closestMatch.library.latitude,
          lng: closestMatch.library.longitude,
        });

        setMapZoom(18);
        setLocating(false);
      },
      (geolocationError) => {
        console.error("Could not get current location:", geolocationError);

        switch (geolocationError.code) {
          case geolocationError.PERMISSION_DENIED:
            setLocationError(
              "Location permission was denied. Please allow location access and try again.",
            );
            break;

          case geolocationError.POSITION_UNAVAILABLE:
            setLocationError("Your current location is unavailable.");
            break;

          case geolocationError.TIMEOUT:
            setLocationError(
              "Finding your location took too long. Please try again.",
            );
            break;

          default:
            setLocationError("Could not determine your current location.");
        }

        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  }

  function confirmNearbyLibrary() {
    if (!nearbyMatch) {
      return;
    }

    onUploadPhoto(nearbyMatch.library);
    setNearbyMatch(null);
  }

  function cancelNearbyLibrary() {
    setNearbyMatch(null);
    setSelectedLibrary(null);
  }

  function openLibraryFromSearch(library: Library) {
    setIsBookSearchOpen(false);
    setSelectedLibrary(library);
    setNearbyMatch(null);
    setLocationError("");
    setLibraryPhotoUrl(null);

    setMapCenter({
      lat: library.latitude,
      lng: library.longitude,
    });

    setMapZoom(18);
  }

  if (!apiKey) {
    return (
      <div className="mx-auto flex h-[600px] max-w-6xl items-center justify-center px-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="font-medium text-foreground">
            Google Maps API key is missing.
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local, then restart the
            development server.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center">
        <p className="text-muted-foreground">Loading libraries…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[600px] items-center justify-center p-6">
        <p className="text-red-600">Could not load libraries: {error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex flex-wrap gap-3">
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

          <button
            type="button"
            onClick={onAddLibrary}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 font-medium text-foreground hover:bg-secondary"
          >
            ＋ Add a New Library
          </button>
        </div>

        <div ref={bookSearchAreaRef} className="mt-4">
          <label
            htmlFor="book-search"
            className="block text-base font-semibold text-foreground"
          >
            Search the Library Inventories
          </label>

          <div className="relative mt-2">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg"
            >
              🔎
            </span>

            <input
              id="book-search"
              type="search"
              value={bookSearchQuery}
              onFocus={() => {
                if (bookSearchQuery.trim()) {
                  setIsBookSearchOpen(true);
                }
              }}
              onChange={(event) => {
                setBookSearchQuery(event.target.value);
                setIsBookSearchOpen(Boolean(event.target.value.trim()));
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsBookSearchOpen(false);
                  event.currentTarget.blur();
                }
              }}
              placeholder="Search by book title or author"
              className="h-12 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {bookSearchQuery.trim() && isBookSearchOpen && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-background p-2 shadow-sm">
              {bookSearchResults.length === 0 ? (
                <p className="px-3 py-4 text-base text-muted-foreground">
                  No matching books found.
                </p>
              ) : (
                <>
                  <p className="px-3 py-1 text-sm font-medium text-muted-foreground">
                    {bookSearchResults.length}{" "}
                    {bookSearchResults.length === 1 ? "match" : "matches"}
                  </p>

                  <ul className="mt-1 space-y-1">
                    {bookSearchResults.map((result) => (
                      <li key={result.key}>
                        <button
                          type="button"
                          onClick={() => openLibraryFromSearch(result.library)}
                          className="w-full min-w-0 rounded-lg px-3 py-3 text-left transition hover:bg-secondary focus:bg-secondary focus:outline-none"
                        >
                          <span className="block max-w-full break-words text-base font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">
                            {result.title}
                          </span>

                          {result.author && (
                            <span className="mt-1 block max-w-full break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                              {result.author}
                            </span>
                          )}

                          <span className="mt-1.5 block max-w-full break-words text-sm font-medium text-blue-700 [overflow-wrap:anywhere]">
                            📍 {result.library.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {locationError && (
          <div
            className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
            role="alert"
          >
            <p>{locationError}</p>

            <button
              type="button"
              onClick={onAddLibrary}
              className="mt-3 inline-flex rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground"
            >
              Add a New Library
            </button>
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
                  Number.isFinite(library.latitude) &&
                  Number.isFinite(library.longitude),
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
                    setSelectedLibrary(library);
                    setNearbyMatch(null);
                    setLocationError("");

                    setMapCenter({
                      lat: library.latitude,
                      lng: library.longitude,
                    });
                  }}
                />
              ))}

            {selectedLibrary && !isMobile && (
              <InfoWindow
                maxWidth={600}
                position={{
                  lat: selectedLibrary.latitude,
                  lng: selectedLibrary.longitude,
                }}
                onCloseClick={() => {
                  setSelectedLibrary(null);
                  setLibraryPhotoUrl(null);
                }}
              >
                <div className="box-border max-h-[78vh] w-[calc(100vw-48px)] max-w-[420px] overflow-x-hidden overflow-y-auto whitespace-normal px-0 pb-1 pt-0 text-black [overflow-wrap:anywhere] sm:max-h-none sm:w-[560px] sm:max-w-[560px] sm:overflow-visible">
                  <div className="box-border w-full min-w-0 max-w-full overflow-x-hidden sm:grid sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-4 sm:overflow-visible">
                    <div className="w-full min-w-0 max-w-full sm:sticky sm:top-0 sm:self-start">
                      {photoLoading && (
                        <div className="mb-3 flex h-36 w-full items-center justify-center rounded-lg bg-gray-100 sm:mb-0 sm:h-56">
                          <p className="text-xs text-gray-500">Loading photo…</p>
                        </div>
                      )}

                      {!photoLoading && libraryPhotoUrl && (
                        <img
                          src={libraryPhotoUrl}
                          alt={selectedLibrary.name}
                          className="-mt-2 mb-3 block max-h-44 w-full max-w-full rounded-lg bg-gray-100 object-contain brightness-110 contrast-105 sm:mt-0 sm:mb-0 sm:h-56 sm:max-h-none"
                        />
                      )}

                      <div className="w-full min-w-0 max-w-full sm:mt-3">
                        <h2 className="break-words text-lg font-semibold leading-tight sm:text-base">
                          {selectedLibrary.name}
                        </h2>

                        {selectedLibrary.address && (
                          <p className="mt-1 break-words text-sm text-gray-500 sm:mt-0.5 sm:text-xs">
                            {selectedLibrary.address}
                          </p>
                        )}

                        <div className="mt-3 grid gap-2 sm:mt-2">
                          <div className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 sm:px-2.5 sm:py-1 sm:text-xs">
                            📚
                            <span>{selectedLibrary.bookCount} books</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => onUploadPhoto(selectedLibrary)}
                            className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:h-8"
                          >
                            📷 Update Inventory
                          </button>

                          <p className="max-w-full break-words rounded-lg bg-gray-100 px-2.5 py-2 text-xs font-medium text-gray-700">
                            <span aria-hidden="true">🕒</span>{" "}
                            <span className="font-semibold">Last updated:</span>{" "}
                            {selectedLibrary.lastUpdated}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="w-full min-w-0 max-w-full overflow-x-hidden sm:overflow-visible">
                  {/* Current inventory */}
                  <div className="mt-3 sm:mt-0">
                    <p className="text-base font-semibold sm:text-sm">Current Inventory</p>

                    {selectedLibrary.books.length === 0 ? (
                      <p className="mt-2 text-xs text-gray-500">
                        No books have been inventoried yet.
                      </p>
                    ) : (
                      <ul className="mt-2 max-h-72 w-full min-w-0 max-w-full space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain pr-1 text-sm sm:max-h-80 sm:space-y-1.5">
                        {[...selectedLibrary.books]
                          .sort((firstBook, secondBook) => {
                            const firstTitle =
                              typeof firstBook === "string"
                                ? firstBook
                                : typeof firstBook === "object" &&
                                    firstBook !== null &&
                                    "title" in firstBook
                                  ? String(firstBook.title)
                                  : "";

                            const secondTitle =
                              typeof secondBook === "string"
                                ? secondBook
                                : typeof secondBook === "object" &&
                                    secondBook !== null &&
                                    "title" in secondBook
                                  ? String(secondBook.title)
                                  : "";

                            return firstTitle.localeCompare(secondTitle);
                          })
                          .map((book, index) => {
                            const title =
                              typeof book === "string"
                                ? book
                                : typeof book === "object" &&
                                    book !== null &&
                                    "title" in book
                                  ? String(book.title)
                                  : "Untitled book";

                            const author =
                              typeof book === "object" &&
                              book !== null &&
                              "author" in book &&
                              book.author
                                ? String(book.author)
                                : null;

                            return (
                              <li
                                key={`${title}-${index}`}
                                className="w-full min-w-0 max-w-full overflow-hidden rounded-lg bg-gray-100 px-3 py-2 sm:rounded-md sm:px-2.5 sm:py-1.5"
                              >
                                <p className="w-full min-w-0 max-w-full whitespace-normal break-words text-base font-medium leading-tight [overflow-wrap:anywhere] sm:text-sm">
                                  {title}
                                </p>

                                {author && (
                                  <p className="mt-1 w-full min-w-0 max-w-full whitespace-normal break-words text-sm leading-tight text-gray-500 [overflow-wrap:anywhere] sm:mt-0.5 sm:text-[11px]">
                                    {author}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                      </ul>
                    )}
                  </div>

                    </div>
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>

        {selectedLibrary && isMobile && (
          <div className="absolute inset-4 z-30 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white p-4 text-black shadow-2xl">
            <button
              type="button"
              aria-label="Close library details"
              onClick={() => {
                setSelectedLibrary(null);
                setLibraryPhotoUrl(null);
              }}
              className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/95 text-3xl leading-none text-gray-600 shadow-sm"
            >
              ×
            </button>

            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 [overflow-wrap:anywhere]">
              {photoLoading && (
                <div className="mb-3 flex h-40 w-full items-center justify-center rounded-xl bg-gray-100">
                  <p className="text-base text-gray-500">Loading photo…</p>
                </div>
              )}

              {!photoLoading && libraryPhotoUrl && (
                <img
                  src={libraryPhotoUrl}
                  alt={selectedLibrary.name}
                  className="mb-3 block h-48 w-full rounded-xl bg-gray-100 object-contain brightness-110 contrast-105"
                />
              )}

              <h2 className="max-w-full whitespace-normal break-words pr-12 text-xl font-semibold leading-tight [overflow-wrap:anywhere]">
                {selectedLibrary.name}
              </h2>

              {selectedLibrary.address && (
                <p className="mt-1 max-w-full whitespace-normal break-words text-base leading-snug text-gray-600 [overflow-wrap:anywhere]">
                  {selectedLibrary.address}
                </p>
              )}

              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-base font-medium text-blue-700">
                📚 <span>{selectedLibrary.bookCount} books</span>
              </div>

              <button
                type="button"
                onClick={() => onUploadPhoto(selectedLibrary)}
                className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                📷 Update Inventory
              </button>

              <p className="mt-2 max-w-full whitespace-normal break-words rounded-lg bg-gray-100 px-3 py-2.5 text-sm font-medium text-gray-700 [overflow-wrap:anywhere]">
                <span aria-hidden="true">🕒</span>{" "}
                <span className="font-semibold">Last updated:</span>{" "}
                {selectedLibrary.lastUpdated}
              </p>

              <p className="mt-5 text-xl font-semibold">Current Inventory</p>

              {selectedLibrary.books.length === 0 ? (
                <p className="mt-2 text-base text-gray-500">
                  No books have been inventoried yet.
                </p>
              ) : (
                <ul className="mt-3 min-w-0 space-y-2.5 overflow-x-hidden pb-1">
                  {[...selectedLibrary.books]
                    .sort((firstBook, secondBook) => {
                      const firstTitle =
                        typeof firstBook === "string"
                          ? firstBook
                          : typeof firstBook === "object" &&
                              firstBook !== null &&
                              "title" in firstBook
                            ? String(firstBook.title)
                            : "";

                      const secondTitle =
                        typeof secondBook === "string"
                          ? secondBook
                          : typeof secondBook === "object" &&
                              secondBook !== null &&
                              "title" in secondBook
                            ? String(secondBook.title)
                            : "";

                      return firstTitle.localeCompare(secondTitle);
                    })
                    .map((book, index) => {
                      const title =
                        typeof book === "string"
                          ? book
                          : typeof book === "object" &&
                              book !== null &&
                              "title" in book
                            ? String(book.title)
                            : "Untitled book";

                      const author =
                        typeof book === "object" &&
                        book !== null &&
                        "author" in book &&
                        book.author
                          ? String(book.author)
                          : null;

                      return (
                        <li
                          key={`${title}-${index}`}
                          className="min-w-0 overflow-hidden rounded-xl bg-gray-100 px-4 py-3"
                        >
                          <p className="max-w-full whitespace-normal break-words text-lg font-medium leading-tight [overflow-wrap:anywhere]">
                            {title}
                          </p>

                          {author && (
                            <p className="mt-1 max-w-full whitespace-normal break-words text-base leading-tight text-gray-500 [overflow-wrap:anywhere]">
                              {author}
                            </p>
                          )}
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </div>
        )}

        {nearbyMatch && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-blue-300 bg-white/95 p-4 text-blue-950 shadow-xl backdrop-blur sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2">
            <p className="text-sm font-semibold">Nearest library found</p>

            <p className="mt-1 text-lg font-semibold">
              {nearbyMatch.library.name}
            </p>

            {nearbyMatch.library.address && (
              <p className="mt-1 text-sm">{nearbyMatch.library.address}</p>
            )}

            <p className="mt-2 text-sm">
              Approximately{" "}
              <strong>{Math.round(nearbyMatch.distanceMeters)} meters</strong>{" "}
              from your current location.
            </p>

            <p className="mt-2 text-sm">
              Confirm that the red library marker matches the blue “You are
              here” dot.
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
  );
}
