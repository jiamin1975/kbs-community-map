"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps";

import { auth, db, storage } from "@/lib/firebase";
import type { Library } from "@/lib/libraries";

type NearbyLibrary = {
  id: string;
  name: string;
  address: string;
  distanceMeters: number;
};

type BookPhotoPreview = {
  name: string;
  url: string;
};

type RecognizedBook = {
  title: string;
  author: string | null;
  confidence: "high" | "medium" | "low";
  visibleText: string | null;
};

type RecognitionResult = {
  books: RecognizedBook[];
  notes: string;
};

type DuplicateCheckStatus = "idle" | "checking" | "clear" | "duplicate";

const duplicateDistanceMeters = 5;

type AddLibraryFormProps = {
  onLibraryAdded?: (library: Library) => void;
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

function generateLibraryName(address: string) {
  const streetAddress = address.split(",")[0]?.trim() ?? "";
  const streetWithoutNumber = streetAddress.replace(/^\d+\s+/, "").trim();

  return streetWithoutNumber
    ? `${streetWithoutNumber} Little Library`
    : "Community Little Library";
}

function normalizeBookTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeBooks(existing: RecognizedBook[], incoming: RecognizedBook[]) {
  const merged = new Map<string, RecognizedBook>();

  for (const book of [...existing, ...incoming]) {
    const key = normalizeBookTitle(book.title);

    if (!key) continue;

    const previous = merged.get(key);

    merged.set(
      key,
      previous
        ? {
            ...previous,
            author: previous.author ?? book.author,
            visibleText: previous.visibleText ?? book.visibleText,
            confidence:
              previous.confidence === "high" ? "high" : book.confidence,
          }
        : book,
    );
  }

  return Array.from(merged.values());
}

export function AddLibraryForm({ onLibraryAdded }: AddLibraryFormProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [verified, setVerified] = useState(false);

  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const [showAdvancedLocation, setShowAdvancedLocation] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [nearbyLibrary, setNearbyLibrary] = useState<NearbyLibrary | null>(
    null,
  );
  const [duplicateCheckStatus, setDuplicateCheckStatus] =
    useState<DuplicateCheckStatus>("idle");

  const [mapCenter, setMapCenter] = useState({
    lat: 39.0458,
    lng: -77.1224,
  });

  const [mapZoom, setMapZoom] = useState(18);

  const markerLatitude = Number(latitude);
  const markerLongitude = Number(longitude);

  const [photo, setPhoto] = useState<File | null>(null);

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingLibraryId, setPendingLibraryId] = useState(
    () => doc(collection(db, "libraries")).id,
  );
  const [bookPhoto, setBookPhoto] = useState<File | null>(null);
  const [bookPreviewUrl, setBookPreviewUrl] = useState<string | null>(null);
  const [processedBookPhotos, setProcessedBookPhotos] = useState<
    BookPhotoPreview[]
  >([]);
  const processedBookPhotoUrls = useRef<string[]>([]);
  const [recognizedBooks, setRecognizedBooks] = useState<RecognizedBook[]>([]);
  const [bookPhotosProcessed, setBookPhotosProcessed] = useState(0);
  const [analyzingBooks, setAnalyzingBooks] = useState(false);
  const [bookRecognitionError, setBookRecognitionError] = useState("");

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  useEffect(() => {
    return () => {
      if (bookPreviewUrl) {
        URL.revokeObjectURL(bookPreviewUrl);
      }
    };
  }, [bookPreviewUrl]);

  useEffect(() => {
    return () => {
      processedBookPhotoUrls.current.forEach((url) =>
        URL.revokeObjectURL(url),
      );
    };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthLoading(true);
      setAccessMessage("");

      if (!user) {
        setIsAuthorized(false);
        setAuthLoading(false);
        return;
      }

      try {
        const volunteerSnapshot = await getDoc(
          doc(db, "authorizedVolunteers", user.uid),
        );

        if (
          volunteerSnapshot.exists() &&
          volunteerSnapshot.data().active === true
        ) {
          setIsAuthorized(true);
        } else {
          setIsAuthorized(false);
          setAccessMessage(
            "This Google account is not approved yet. Send your account email to a KBS administrator for approval.",
          );
        }
      } catch (authorizationError) {
        console.error("Could not verify volunteer access:", authorizationError);
        setIsAuthorized(false);
        setAccessMessage(
          "We could not verify your volunteer access. Please try again.",
        );
      } finally {
        setAuthLoading(false);
      }
    });
  }, []);

  async function handleGoogleSignIn() {
    setSigningIn(true);
    setAccessMessage("");

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } catch (signInError) {
      console.error("Google sign-in failed:", signInError);
      setAccessMessage("Google sign-in did not complete. Please try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    setAccessMessage("");
  }

  const markerPosition =
    latitude !== "" &&
    longitude !== "" &&
    Number.isFinite(markerLatitude) &&
    Number.isFinite(markerLongitude)
      ? {
          lat: markerLatitude,
          lng: markerLongitude,
        }
      : null;

  const stepOneReady = Boolean(markerPosition && name.trim() && address.trim());
  const stepOneComplete = stepOneReady && duplicateCheckStatus === "clear";
  const stepTwoComplete = stepOneComplete && photo !== null;
  const stepThreeComplete = stepTwoComplete && recognizedBooks.length > 0;

  function handleCameraChanged(event: MapCameraChangedEvent) {
    setMapCenter(event.detail.center);
    setMapZoom(event.detail.zoom);
  }

  async function updateAddressFromCoordinates(
    newLatitude: number,
    newLongitude: number,
  ) {
    try {
      const response = await fetch("/api/reverse-geocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude: newLatitude,
          longitude: newLongitude,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not find the address.");
      }

      const updatedAddress = data.address ?? "";
      const updatedNeighborhood = data.neighborhood ?? "";

      setAddress(updatedAddress);
      setNeighborhood(updatedNeighborhood);
      setName(generateLibraryName(updatedAddress));

      return true;
    } catch (caughtError) {
      console.error("Could not refresh address:", caughtError);

      setMessage(
        "The location was updated, but the address could not be refreshed automatically.",
      );

      return false;
    }
  }

  async function handleMarkerDragEnd(event: google.maps.MapMouseEvent) {
    const newPosition = event.latLng;

    if (!newPosition) {
      return;
    }

    const newLatitude = newPosition.lat();
    const newLongitude = newPosition.lng();

    /*
     * These two state updates are essential.
     * They permanently save the dragged marker position,
     * so it does not return to its old location when the
     * map zooms or rerenders.
     */
    setLatitude(newLatitude.toFixed(6));
    setLongitude(newLongitude.toFixed(6));

    setMapCenter({
      lat: newLatitude,
      lng: newLongitude,
    });

    setError("");
    setNearbyLibrary(null);

    const addressUpdated = await updateAddressFromCoordinates(
      newLatitude,
      newLongitude,
    );

    if (addressUpdated) {
      setMessage(
        "Library location adjusted. The address and neighborhood were updated automatically. Please confirm them before saving.",
      );
    }
  }

  function useCurrentLocation() {
    setMessage("");
    setError("");
    setNearbyLibrary(null);
    setNeighborhood("");

    if (!navigator.geolocation) {
      setError("Your browser does not support location services.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const currentLatitude = position.coords.latitude;

        const currentLongitude = position.coords.longitude;

        setLatitude(currentLatitude.toFixed(6));
        setLongitude(currentLongitude.toFixed(6));

        setMapCenter({
          lat: currentLatitude,
          lng: currentLongitude,
        });

        setMapZoom(19);

        const addressUpdated = await updateAddressFromCoordinates(
          currentLatitude,
          currentLongitude,
        );

        if (addressUpdated) {
          setMessage(
            "Current location, address, and neighborhood were added. Drag the marker if the GPS position is not exact.",
          );
        }

        setShowAdvancedLocation(false);
        setLocating(false);
      },
      (locationError) => {
        console.error("Could not get current location:", locationError);

        switch (locationError.code) {
          case locationError.PERMISSION_DENIED:
            setError(
              "Location permission was denied. Please allow location access and try again.",
            );
            break;

          case locationError.POSITION_UNAVAILABLE:
            setError("Your current location is unavailable.");
            break;

          case locationError.TIMEOUT:
            setError("The location request timed out. Please try again.");
            break;

          default:
            setError("Could not determine your location.");
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

  async function findNearbyLibrary(
    latitudeNumber: number,
    longitudeNumber: number,
  ): Promise<NearbyLibrary | null> {
    const snapshot = await getDocs(collection(db, "libraries"));

    let closestLibrary: NearbyLibrary | null = null;

    for (const documentSnapshot of snapshot.docs) {
      const data = documentSnapshot.data();

      const existingLatitude = Number(data.latitude);
      const existingLongitude = Number(data.longitude);

      if (
        !Number.isFinite(existingLatitude) ||
        !Number.isFinite(existingLongitude)
      ) {
        continue;
      }

      const distanceMeters = calculateDistanceMeters(
        latitudeNumber,
        longitudeNumber,
        existingLatitude,
        existingLongitude,
      );

      if (!closestLibrary || distanceMeters < closestLibrary.distanceMeters) {
        closestLibrary = {
          id: documentSnapshot.id,
          name: data.name ?? "Unnamed library",
          address: data.address ?? "",
          distanceMeters,
        };
      }
    }

    return closestLibrary;
  }

  useEffect(() => {
    if (!stepOneReady || !markerPosition) {
      setDuplicateCheckStatus("idle");
      setNearbyLibrary(null);
      return;
    }

    let cancelled = false;

    setDuplicateCheckStatus("checking");
    setNearbyLibrary(null);

    const timer = window.setTimeout(async () => {
      try {
        const closestLibrary = await findNearbyLibrary(
          markerPosition.lat,
          markerPosition.lng,
        );

        if (cancelled) return;

        if (
          closestLibrary &&
          closestLibrary.distanceMeters <= duplicateDistanceMeters
        ) {
          setNearbyLibrary(closestLibrary);
          setDuplicateCheckStatus("duplicate");
        } else {
          setDuplicateCheckStatus("clear");
        }
      } catch (caughtError) {
        if (cancelled) return;

        console.error("Could not check for duplicate libraries:", caughtError);
        setDuplicateCheckStatus("idle");
        setError("Could not check this location. Please try again.");
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [stepOneReady, markerPosition?.lat, markerPosition?.lng, address, name]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedPhoto = event.target.files?.[0] ?? null;

    setMessage("");
    setError("");

    if (!selectedPhoto) {
      setPhoto(null);
      setPhotoPreviewUrl(null);
      return;
    }

    const allowedPhotoTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedPhotoTypes.includes(selectedPhoto.type)) {
      event.target.value = "";
      setPhoto(null);
      setPhotoPreviewUrl(null);
      setError("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    const maximumPhotoSize = 10 * 1024 * 1024;

    if (selectedPhoto.size > maximumPhotoSize) {
      event.target.value = "";
      setPhoto(null);
      setPhotoPreviewUrl(null);
      setError("The photo must be smaller than 10 MB.");
      return;
    }

    setPhoto(selectedPhoto);
    setPhotoPreviewUrl(URL.createObjectURL(selectedPhoto));
  }

  function handleBookPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedPhoto = event.target.files?.[0] ?? null;

    setBookRecognitionError("");

    if (!selectedPhoto) {
      setBookPhoto(null);
      setBookPreviewUrl(null);
      return;
    }

    if (!selectedPhoto.type.startsWith("image/")) {
      event.target.value = "";
      setBookRecognitionError("Please choose an image file.");
      return;
    }

    if (selectedPhoto.size > 10 * 1024 * 1024) {
      event.target.value = "";
      setBookRecognitionError("The book photo must be smaller than 10 MB.");
      return;
    }

    setBookPhoto(selectedPhoto);
    setBookPreviewUrl(URL.createObjectURL(selectedPhoto));
  }

  async function analyzeBookPhoto() {
    if (!bookPhoto) {
      setBookRecognitionError("Choose a book photo first.");
      return;
    }

    setAnalyzingBooks(true);
    setBookRecognitionError("");

    try {
      const formData = new FormData();
      formData.append("image", bookPhoto);
      formData.append("libraryId", pendingLibraryId);

      const response = await fetch("/api/analyze-books", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Book recognition failed.");
      }

      const recognitionResult = data as RecognitionResult;

      if (recognitionResult.books.length === 0) {
        setBookRecognitionError(
          "No books were recognized. Try a clearer, closer photo.",
        );
        return;
      }

      setRecognizedBooks((current) =>
        mergeBooks(current, recognitionResult.books),
      );
      const processedPreviewUrl = URL.createObjectURL(bookPhoto);
      processedBookPhotoUrls.current.push(processedPreviewUrl);
      setProcessedBookPhotos((current) => [
        ...current,
        { name: bookPhoto.name, url: processedPreviewUrl },
      ]);
      setBookPhotosProcessed((count) => count + 1);
      setBookPhoto(null);
    } catch (caughtError) {
      setBookRecognitionError(
        caughtError instanceof Error
          ? caughtError.message
          : "Book recognition failed.",
      );
    } finally {
      setAnalyzingBooks(false);
    }
  }

  async function handleSubmit() {
    setMessage("");
    setError("");
    setNearbyLibrary(null);

    const latitudeNumber = Number(latitude);
    const longitudeNumber = Number(longitude);

    if (!name.trim()) {
      setError("Library name is required.");
      return;
    }

    if (!address.trim()) {
      setError("Address is required.");
      return;
    }

    if (!photo) {
      setError("Please add a photo of the library.");
      return;
    }

    if (recognizedBooks.length === 0) {
      setError("Please analyze at least one book photo.");
      return;
    }

    if (
      !Number.isFinite(latitudeNumber) ||
      latitudeNumber < -90 ||
      latitudeNumber > 90
    ) {
      setError("Enter a valid latitude.");
      return;
    }

    if (
      !Number.isFinite(longitudeNumber) ||
      longitudeNumber < -180 ||
      longitudeNumber > 180
    ) {
      setError("Enter a valid longitude.");
      return;
    }

    setSaving(true);

    try {
      const closestLibrary = await findNearbyLibrary(
        latitudeNumber,
        longitudeNumber,
      );

      if (
        closestLibrary &&
        closestLibrary.distanceMeters <= duplicateDistanceMeters
      ) {
        setNearbyLibrary(closestLibrary);
        setDuplicateCheckStatus("duplicate");

        setError(
          `A library already exists about ${Math.round(
            closestLibrary.distanceMeters,
          )} meters from this location.`,
        );

        return;
      }

      const libraryName = name.trim();
      const libraryAddress = address.trim();
      const libraryNeighborhood = neighborhood.trim();

      const newLibraryReference = doc(db, "libraries", pendingLibraryId);

      const extensionByType: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };

      const photoFile = `${newLibraryReference.id}.${
        extensionByType[photo.type] ?? "jpg"
      }`;

      const photoReference = ref(storage, `library-photos/${photoFile}`);

      setUploadingPhoto(true);

      await uploadBytes(photoReference, photo, {
        contentType: photo.type,
      });

      try {
        await setDoc(newLibraryReference, {
          name: libraryName,
          address: libraryAddress,
          neighborhood: libraryNeighborhood,

          latitude: latitudeNumber,
          longitude: longitudeNumber,

          books: recognizedBooks,
          bookCount: recognizedBooks.length,
          recognitionNotes: `Inventory created from ${bookPhotosProcessed} book photo${
            bookPhotosProcessed === 1 ? "" : "s"
          }.`,

          verified,
          photoFile,

          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      } catch (firestoreError) {
        await deleteObject(photoReference).catch((cleanupError) => {
          console.error(
            "Could not remove uploaded photo after the library save failed:",
            cleanupError,
          );
        });

        throw firestoreError;
      }

      const newlyAddedLibrary: Library = {
        id: newLibraryReference.id,
        name: libraryName,
        address: libraryAddress,
        neighborhood: libraryNeighborhood,
        latitude: latitudeNumber,
        longitude: longitudeNumber,
        books: recognizedBooks,
        bookCount: recognizedBooks.length,
        lastUpdated: "Just created",
        verified,
        photoFile,
      };

      onLibraryAdded?.(newlyAddedLibrary);

      setName("");
      setAddress("");
      setNeighborhood("");
      setLatitude("");
      setLongitude("");
      setVerified(false);
      setPhoto(null);
      setPhotoPreviewUrl(null);
      setBookPhoto(null);
      setBookPreviewUrl(null);
      processedBookPhotoUrls.current.forEach((url) =>
        URL.revokeObjectURL(url),
      );
      processedBookPhotoUrls.current = [];
      setProcessedBookPhotos([]);
      setRecognizedBooks([]);
      setBookPhotosProcessed(0);
      setBookRecognitionError("");
      setPendingLibraryId(doc(collection(db, "libraries")).id);
      setNearbyLibrary(null);
      setShowAdvancedLocation(false);

      setMapCenter({
        lat: 39.0458,
        lng: -77.1224,
      });

      setMapZoom(18);

      setMessage("Library, photo, and book inventory added successfully.");
    } catch (caughtError) {
      console.error("Could not add library:", caughtError);

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not add the library.",
      );
    } finally {
      setUploadingPhoto(false);
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Checking volunteer access…
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Add a New Library</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorized KBS volunteers can sign in with Google to add a library.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={signingIn}
          className="flex items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-600"
          >
            G
          </span>
          {signingIn ? "Signing In…" : "Continue with Google"}
        </button>

        {accessMessage && (
          <p className="text-sm text-red-600" role="alert">
            {accessMessage}
          </p>
        )}
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="grid gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
        <div>
          <h2 className="font-semibold">Volunteer Approval Needed</h2>
          <p className="mt-1 text-sm">{accessMessage}</p>
          <p className="mt-2 text-xs">
            Signed in as {currentUser.email ?? "Google user"}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="w-fit rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-medium hover:bg-amber-100"
        >
          Use a Different Account
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-3 max-sm:[&_button]:text-base max-sm:[&_button_span]:text-base max-sm:[&_input]:text-base max-sm:[&_label]:text-sm max-sm:[&_label_span]:text-sm max-sm:[&_p]:text-sm sm:p-4">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            Volunteer: {currentUser.email}
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={saving}
            className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
          >
            Sign Out
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-base font-bold text-white max-sm:!text-base sm:h-7 sm:px-2.5 sm:text-xs sm:font-semibold ${
                duplicateCheckStatus === "duplicate"
                  ? "bg-amber-500"
                  : stepOneComplete
                    ? "bg-green-600"
                    : "bg-blue-600"
              }`}
            >
              {stepOneComplete ? "✓ Step 1" : "Step 1"}
            </span>
            <p className="text-lg font-bold max-sm:!text-lg sm:text-sm sm:font-semibold">
              {duplicateCheckStatus === "checking"
                ? "Checking Location…"
                : duplicateCheckStatus === "duplicate"
                  ? "Possible Duplicate Found"
                  : stepOneComplete
                    ? "Location Confirmed"
                    : "Confirm Location"}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating || saving}
              className="inline-flex h-12 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-blue-700 bg-blue-600 px-4 text-sm font-bold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
            >
              <span aria-hidden="true">📍</span>
              <span className="truncate">
                {locating ? "Finding Location…" : "Use My Current Location"}
              </span>
            </button>

            <label className="grid min-w-0 gap-1">
              <span className="flex items-center justify-between gap-1 text-xs font-medium">
                <span>Library Name</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  Auto
                </span>
              </span>

              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-base sm:h-9 sm:px-2.5 sm:text-xs"
                placeholder="Generated from location"
              />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-medium">Address</span>

              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-base sm:h-9 sm:px-2.5 sm:text-xs"
                placeholder="123 Main St, Rockville, MD"
              />
            </label>

            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-medium">Neighborhood</span>

              <input
                value={neighborhood}
                onChange={(event) => setNeighborhood(event.target.value)}
                className="h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-base sm:h-9 sm:px-2.5 sm:text-xs"
                placeholder="Town Center"
              />
            </label>
          </div>

          {markerPosition && (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border bg-secondary px-3 py-2">
                <p className="text-sm font-medium">
                  Confirm the library location
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Drag to adjust
                </p>
              </div>

              <div className="h-[240px] w-full">
                <APIProvider
                  apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}
                >
                  <GoogleMap
                    center={mapCenter}
                    zoom={mapZoom}
                    onCameraChanged={handleCameraChanged}
                    mapId="DEMO_MAP_ID"
                    gestureHandling="greedy"
                    mapTypeControl={false}
                    streetViewControl={false}
                    fullscreenControl={false}
                  >
                    <AdvancedMarker
                      position={markerPosition}
                      draggable
                      onDragEnd={handleMarkerDragEnd}
                      title="Drag to the exact library location"
                    >
                      <div className="flex flex-col items-center">
                        <div className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                          Library
                        </div>

                        <div className="h-3 w-3 -translate-y-0.5 rotate-45 bg-red-600" />
                      </div>
                    </AdvancedMarker>
                  </GoogleMap>
                </APIProvider>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-background">
            <button
              type="button"
              onClick={() => setShowAdvancedLocation((current) => !current)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <span>Advanced Location</span>

              <span aria-hidden="true">{showAdvancedLocation ? "−" : "+"}</span>
            </button>

            {showAdvancedLocation && (
              <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Latitude</span>

                  <input
                    value={latitude}
                    onChange={(event) => setLatitude(event.target.value)}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                    placeholder="39.084013"
                    inputMode="decimal"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Longitude</span>

                  <input
                    value={longitude}
                    onChange={(event) => setLongitude(event.target.value)}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                    placeholder="-77.152812"
                    inputMode="decimal"
                  />
                </label>
              </div>
            )}
          </div>

          {duplicateCheckStatus === "checking" && (
            <div
              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800"
              role="status"
            >
              Checking for an existing library near this location…
            </div>
          )}

          {duplicateCheckStatus === "clear" && (
            <div
              className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-800"
              role="status"
            >
              ✓ No duplicate found. Continue to Step 2.
            </div>
          )}

          {duplicateCheckStatus === "duplicate" && nearbyLibrary && (
            <div
              className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              role="alert"
            >
              <p className="font-semibold">A library may already be here</p>
              <p className="mt-1">{nearbyLibrary.name}</p>
              {nearbyLibrary.address && (
                <p className="text-xs">{nearbyLibrary.address}</p>
              )}
              <p className="mt-1 text-xs">
                About {Math.round(nearbyLibrary.distanceMeters)} meters away.
                Adjust the marker if this is a different library.
              </p>
            </div>
          )}

          <div className="mt-1 flex items-center gap-2 border-t border-border pt-3">
            <span
              className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-base font-bold max-sm:!text-base sm:h-7 sm:px-2.5 sm:text-xs sm:font-semibold ${
                stepTwoComplete
                  ? "bg-green-600 text-white"
                  : stepOneComplete
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500"
              }`}
            >
              {stepTwoComplete ? "✓ Step 2" : "Step 2"}
            </span>
            <p
              className={`text-lg font-bold max-sm:!text-lg sm:text-sm sm:font-semibold ${
                stepOneComplete ? "" : "text-muted-foreground"
              }`}
            >
              {stepTwoComplete ? "Library Photo Added" : "Add Library Photo"}
            </p>
          </div>

          <div
            className={`grid min-w-0 max-w-full gap-2 overflow-hidden rounded-xl p-2.5 transition sm:p-3 ${
              stepOneComplete
                ? "bg-blue-50/50"
                : "pointer-events-none bg-gray-50 opacity-50"
            }`}
          >
            <input
              id="library-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              disabled={saving || !stepOneComplete}
              className="hidden"
            />

            {!photoPreviewUrl ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Photo of the outside library box
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    10 MB max
                  </p>
                </div>

                <label
                  htmlFor="library-photo"
                  aria-disabled={!stepOneComplete}
                  className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-700 bg-blue-600 px-4 text-base font-bold text-white shadow-md transition hover:bg-blue-700 sm:h-10 sm:text-sm"
                >
                  📷 Choose Library Photo
                </label>
              </>
            ) : (
              <div className="w-full min-w-0 max-w-full overflow-hidden">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Photos added
                </p>

                <div className="flex w-full min-w-0 max-w-full flex-col gap-3 overflow-x-hidden pb-2 sm:flex-row sm:gap-2 sm:overflow-x-auto sm:overscroll-x-contain sm:pr-1 sm:[scrollbar-width:thin]">
                  <div className="w-full overflow-hidden rounded-xl border border-blue-200 bg-background sm:w-48 sm:shrink-0">
                    <img
                      src={photoPreviewUrl}
                      alt="Preview of the library"
                      className="h-40 w-full bg-gray-100 object-cover brightness-110 contrast-105 sm:h-36"
                    />

                    <div className="p-1.5">
                      <p className="text-[11px] font-semibold leading-tight">Library photo</p>
                      <p className="truncate text-[10px] leading-tight text-muted-foreground">
                        {photo?.name}
                      </p>

                      <div className="mt-1 flex items-center gap-2.5">
                        <label
                          htmlFor="library-photo"
                          className="cursor-pointer text-[10px] font-medium text-muted-foreground underline underline-offset-2 hover:text-blue-700"
                        >
                          Change
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            setPhoto(null);
                            setPhotoPreviewUrl(null);
                          }}
                          disabled={saving}
                          className="text-[10px] font-medium text-muted-foreground underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>

                  {processedBookPhotos.map((bookPhotoPreview, index) => (
                    <div
                      key={bookPhotoPreview.url}
                      className="w-full overflow-hidden rounded-xl border border-violet-200 bg-background sm:w-48 sm:shrink-0"
                    >
                      <img
                        src={bookPhotoPreview.url}
                        alt={`Book photo ${index + 1}`}
                        className="h-40 w-full bg-gray-100 object-cover sm:h-36"
                      />
                      <div className="p-1.5">
                        <p className="text-[11px] font-semibold leading-tight">
                          Book photo {index + 1}
                        </p>
                        <p className="truncate text-[10px] leading-tight text-muted-foreground">
                          {bookPhotoPreview.name}
                        </p>
                        <p className="mt-2 text-[9px] font-semibold leading-tight text-green-700">
                          ✓ Recognition Done
                        </p>
                      </div>
                    </div>
                  ))}

                  {bookPhoto && bookPreviewUrl && (
                    <div className="w-full overflow-hidden rounded-xl border border-dashed border-violet-300 bg-background sm:w-48 sm:shrink-0">
                      <img
                        src={bookPreviewUrl}
                        alt="Book photo awaiting recognition"
                        className="h-40 w-full bg-gray-100 object-cover sm:h-36"
                      />
                      <div className="p-1.5">
                        <p className="text-[11px] font-semibold leading-tight">
                          Book photo {processedBookPhotos.length + 1}
                        </p>
                        <p className="truncate text-[10px] leading-tight text-amber-700">
                          Click Recognize Books
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 border-t border-border pt-3">
            <span
              className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-base font-bold max-sm:!text-base sm:h-7 sm:px-2.5 sm:text-xs sm:font-semibold ${
                stepThreeComplete
                  ? "bg-green-600 text-white"
                  : stepTwoComplete
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500"
              }`}
            >
              {stepThreeComplete ? "✓ Step 3" : "Step 3"}
            </span>
            <p
              className={`text-lg font-bold max-sm:!text-lg sm:text-sm sm:font-semibold ${
                stepTwoComplete ? "" : "text-muted-foreground"
              }`}
            >
              {stepThreeComplete ? "Books Recognized" : "Add Book Photos"}
            </p>
          </div>

          <div
            className={`grid min-w-0 gap-2 overflow-hidden rounded-xl p-3 transition ${
              stepTwoComplete
                ? "bg-violet-50/50"
                : "pointer-events-none bg-gray-50 opacity-50"
            }`}
          >
            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <p className="text-xs text-muted-foreground">
                AI will recognize the visible titles.
              </p>
              {recognizedBooks.length > 0 && (
                <p className="text-xs font-medium text-green-700">
                  ✓ {recognizedBooks.length} book
                  {recognizedBooks.length === 1 ? "" : "s"} found
                </p>
              )}
            </div>

            <input
              id="book-photo"
              type="file"
              accept="image/*"
              onChange={handleBookPhotoChange}
              disabled={saving || analyzingBooks || !stepTwoComplete}
              className="hidden"
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <label
                htmlFor="book-photo"
                className="inline-flex h-12 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-blue-700 bg-blue-600 px-3 text-base font-bold text-white shadow-md transition hover:bg-blue-700 sm:h-10 sm:px-2 sm:text-sm"
              >
                📚{" "}
                {bookPhotosProcessed > 0
                  ? "Choose Another Photo"
                  : "Choose Book Photo"}
              </label>

              <button
                type="button"
                onClick={analyzeBookPhoto}
                disabled={!bookPhoto || analyzingBooks || saving}
                className="inline-flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-violet-700 bg-violet-600 px-3 text-base font-bold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none sm:h-10 sm:px-2 sm:text-sm"
              >
                {analyzingBooks ? "Recognizing…" : "✨ Recognize Books"}
              </button>
            </div>

            {bookRecognitionError && (
              <p className="text-xs text-red-600" role="alert">
                {bookRecognitionError}
              </p>
            )}

            {(bookPreviewUrl || recognizedBooks.length > 0) && (
              recognizedBooks.length > 0 ? (
                <ul className="max-h-28 divide-y divide-green-200 overflow-y-auto rounded-lg border border-green-200 bg-green-50 text-green-950">
                  {recognizedBooks
                    .slice()
                    .sort((a, b) => a.title.localeCompare(b.title))
                    .map((book) => (
                      <li
                        key={normalizeBookTitle(book.title)}
                        className="px-2 py-1"
                      >
                        <p className="text-[11px] font-semibold leading-tight">
                          {book.title}
                        </p>
                        {book.author && (
                          <p className="text-[10px] leading-tight text-green-800">
                            {book.author}
                          </p>
                        )}
                      </li>
                    ))}
                </ul>
              ) : (
                <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-violet-200 bg-background px-3 text-center">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Select Recognize Books to generate the title list
                  </p>
                </div>
              )
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={verified}
              onChange={(event) => setVerified(event.target.checked)}
            />

            <span>Verified by a KBS volunteer</span>
          </label>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              saving || locating || analyzingBooks || !stepThreeComplete
            }
            className="h-12 rounded-xl border border-green-800 bg-green-700 px-4 text-base font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploadingPhoto
              ? "Uploading Photo…"
              : saving
                ? "Adding Library…"
                : `Create Library with ${recognizedBooks.length} Book${
                    recognizedBooks.length === 1 ? "" : "s"
                  }`}
          </button>

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
  );
}
