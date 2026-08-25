"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
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
import {
  BrainCircuit,
  Camera,
  MapPin,
  MapPinned,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";

import { auth, db, storage } from "@/lib/firebase";
import type { Library } from "@/lib/libraries";

type NearbyLibrary = {
  library: Library;
  distanceMeters: number;
};

type BookPhotoPreview = {
  name: string;
  url: string;
};

type PendingBookPhoto = BookPhotoPreview & {
  file: File;
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

type WizardExample = "exterior" | "interior";

type WizardStepHeaderProps = {
  step: 1 | 2 | 3;
  title: string;
  instruction: string;
  icon: LucideIcon;
  example?: WizardExample;
};

function WizardStepHeader({
  step,
  title,
  instruction,
  icon: Icon,
  example,
}: WizardStepHeaderProps) {
  return (
    <div className="kbs-add-step-card grid gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((dotStep) => (
            <span
              key={dotStep}
              className={`size-2.5 rounded-full ${
                dotStep === step
                  ? "bg-green-600"
                  : dotStep < step
                    ? "bg-blue-300"
                    : "bg-gray-300"
              }`}
              aria-hidden="true"
            />
          ))}
        </div>
        <p className="kbs-add-step-label text-xs font-semibold uppercase tracking-wide text-blue-700 max-sm:!text-xs">
          Step {step} of 3
        </p>
      </div>

      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-700 shadow-sm">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="kbs-add-step-title text-lg font-bold leading-tight text-slate-950 max-sm:!text-lg">
            {title}
          </p>
          <p className="kbs-add-step-instruction mt-0.5 text-sm leading-snug text-slate-600 max-sm:!text-sm">
            {instruction}
          </p>
        </div>
      </div>

      {example && (
        <div
          className="relative h-24 overflow-hidden rounded-lg border border-blue-200 bg-transparent sm:h-32"
          aria-label={`${title} example`}
        >
          <img
            src={
              example === "exterior"
                ? "/examples/book-box-exterior.jpg"
                : "/examples/book-box-interior.jpg"
            }
            alt={
              example === "exterior"
                ? "Example of a book box exterior photo"
                : "Example of a book box interior photo showing the books"
            }
            className="h-full w-full object-contain"
          />

          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/50 px-1.5 py-0.5 text-center sm:inset-x-0 sm:bottom-0 sm:top-auto sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:bg-black/65 sm:px-3 sm:py-1.5">
            <p className="text-[7px] font-bold uppercase leading-none tracking-normal text-white sm:text-xs sm:leading-tight sm:tracking-wider">
              <span>Example - Take photo like this</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const duplicateDistanceMeters = 5;
const maximumPhotoSize = 10 * 1024 * 1024;

async function downsamplePhotoIfNeeded(photo: File) {
  if (photo.size <= maximumPhotoSize) {
    return photo;
  }

  const sourceUrl = URL.createObjectURL(photo);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const sourceImage = new Image();
      sourceImage.onload = () => resolve(sourceImage);
      sourceImage.onerror = () => reject(new Error("The photo could not be opened."));
      sourceImage.src = sourceUrl;
    });

    const maximumDimension = 2400;
    const scale = Math.min(
      1,
      maximumDimension / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("The photo could not be resized.");
    }

    context.drawImage(image, 0, 0, width, height);

    const resizedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("The photo could not be resized."));
          }
        },
        "image/jpeg",
        0.82,
      );
    });

    const baseName = photo.name.replace(/\.[^.]+$/, "") || "book-box-photo";

    return new File([resizedBlob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function createCroppedPhoto(
  sourcePhoto: File,
  sourceUrl: string,
  cropArea: Area,
) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const sourceImage = new Image();
    sourceImage.onload = () => resolve(sourceImage);
    sourceImage.onerror = () => reject(new Error("The photo could not be opened."));
    sourceImage.src = sourceUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cropArea.width));
  canvas.height = Math.max(1, Math.round(cropArea.height));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("The photo could not be cropped.");
  }

  context.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const croppedBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("The photo could not be cropped."));
        }
      },
      "image/jpeg",
      0.9,
    );
  });
  const baseName = sourcePhoto.name.replace(/\.[^.]+$/, "") || "book-box-photo";

  return new File([croppedBlob], `${baseName}-cropped.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

type AddLibraryFormProps = {
  onLibraryAdded?: (library: Library) => void;
  onUseExistingLibrary?: (library: Library) => void;
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
    ? `${streetWithoutNumber} Book Box`
    : "Community Book Box";
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

export function AddLibraryForm({
  onLibraryAdded,
  onUseExistingLibrary,
}: AddLibraryFormProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessMessage, setAccessMessage] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [verified, setVerified] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [locationAdjusted, setLocationAdjusted] = useState(false);

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

  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [cropSourcePhoto, setCropSourcePhoto] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingLibraryId, setPendingLibraryId] = useState(
    () => doc(collection(db, "libraries")).id,
  );
  const [pendingBookPhotos, setPendingBookPhotos] = useState<
    PendingBookPhoto[]
  >([]);
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
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl);
      }
    };
  }, [cropSourceUrl]);

  useEffect(() => {
    return () => {
      processedBookPhotoUrls.current.forEach((url) =>
        URL.revokeObjectURL(url),
      );
    };
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      setAccessMessage("");

      if (user) {
        setCurrentUser(user);
        setAuthLoading(false);
        return;
      }

      try {
        await signInAnonymously(auth);
      } catch (signInError) {
        console.error("Could not start public access:", signInError);
        setAccessMessage(
          "Could not prepare the public form. Please refresh and try again.",
        );
        setAuthLoading(false);
      }
    });
  }, []);

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
  const stepThreeComplete =
    stepTwoComplete &&
    recognizedBooks.length > 0 &&
    pendingBookPhotos.length === 0;

  const stepOneHeadingRef = useRef<HTMLHeadingElement>(null);
  const stepTwoHeadingRef = useRef<HTMLHeadingElement>(null);
  const stepThreeHeadingRef = useRef<HTMLHeadingElement>(null);
  const stepNavigationStarted = useRef(false);

  function goToStep(step: 1 | 2 | 3) {
    stepNavigationStarted.current = true;
    setCurrentStep(step);
    setError("");
  }

  useEffect(() => {
    if (!stepNavigationStarted.current) return;

    const heading = {
      1: stepOneHeadingRef.current,
      2: stepTwoHeadingRef.current,
      3: stepThreeHeadingRef.current,
    }[currentStep];

    window.requestAnimationFrame(() => {
      heading?.scrollIntoView({ behavior: "smooth", block: "start" });
      heading?.focus({ preventScroll: true });
    });
  }, [currentStep]);

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

    const addressUpdated = await updateAddressFromCoordinates(
      newLatitude,
      newLongitude,
    );

    if (addressUpdated) {
      setLocationAdjusted(true);
      setMessage("");
    }
  }

  function useCurrentLocation() {
    setMessage("");
    setError("");
    setNearbyLibrary(null);
    setNeighborhood("");
    setLocationAdjusted(false);

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
          setMessage("");
        }
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
          library: {
            id: documentSnapshot.id,
            name: data.name ?? "Unnamed book box",
            address: data.address ?? "",
            neighborhood: data.neighborhood ?? "",
            latitude: existingLatitude,
            longitude: existingLongitude,
            books: Array.isArray(data.books) ? data.books : [],
            bookCount:
              typeof data.bookCount === "number"
                ? data.bookCount
                : Array.isArray(data.books)
                  ? data.books.length
                  : 0,
            lastUpdated: "Recently updated",
            verified: data.verified === true,
            photoFile:
              typeof data.photoFile === "string" ? data.photoFile : "",
          } as Library,
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
    event.target.value = "";

    setMessage("");
    setError("");

    if (!selectedPhoto) {
      setPhoto(null);
      setPhotoPreviewUrl(null);
      return;
    }

    const allowedPhotoTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedPhotoTypes.includes(selectedPhoto.type)) {
      setPhoto(null);
      setPhotoPreviewUrl(null);
      setError("Please choose a JPG, PNG, or WebP image.");
      return;
    }

    setCropSourcePhoto(selectedPhoto);
    setCropSourceUrl(URL.createObjectURL(selectedPhoto));
    setCropPosition({ x: 0, y: 0 });
    setCropZoom(1);
    setCroppedAreaPixels(null);
  }

  function closeCropEditor() {
    setCropSourcePhoto(null);
    setCropSourceUrl(null);
    setCroppedAreaPixels(null);
    setCropPosition({ x: 0, y: 0 });
    setCropZoom(1);
  }

  async function useCroppedPhoto() {
    if (!cropSourcePhoto || !cropSourceUrl || !croppedAreaPixels) {
      return;
    }

    setProcessingPhoto(true);
    setError("");

    try {
      const croppedPhoto = await createCroppedPhoto(
        cropSourcePhoto,
        cropSourceUrl,
        croppedAreaPixels,
      );
      const preparedPhoto = await downsamplePhotoIfNeeded(croppedPhoto);
      setPhoto(preparedPhoto);
      setPhotoPreviewUrl(URL.createObjectURL(preparedPhoto));
      closeCropEditor();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The photo could not be cropped.",
      );
    } finally {
      setProcessingPhoto(false);
    }
  }

  function handleBookPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedPhoto = event.target.files?.[0] ?? null;

    setBookRecognitionError("");

    if (!selectedPhoto) {
      return;
    }

    if (!selectedPhoto.type.startsWith("image/")) {
      event.target.value = "";
      setBookRecognitionError("Please choose an image file.");
      return;
    }

    if (selectedPhoto.size > 10 * 1024 * 1024) {
      event.target.value = "";
      setBookRecognitionError(
        "The box interior photo must be smaller than 10 MB.",
      );
      return;
    }

    const previewUrl = URL.createObjectURL(selectedPhoto);
    processedBookPhotoUrls.current.push(previewUrl);
    setPendingBookPhotos((currentPhotos) => [
      ...currentPhotos,
      { file: selectedPhoto, name: selectedPhoto.name, url: previewUrl },
    ]);
    event.target.value = "";
  }

  async function analyzeAllBookPhotos() {
    if (pendingBookPhotos.length === 0) {
      setBookRecognitionError(
        "Add at least one interior photo before recognizing books.",
      );
      return;
    }

    setAnalyzingBooks(true);
    setBookRecognitionError("");

    try {
      const results = await Promise.all(
        pendingBookPhotos.map(async ({ file }) => {
          const formData = new FormData();
          formData.append("image", file);
          formData.append("libraryId", pendingLibraryId);

          const response = await fetch("/api/analyze-books", {
            method: "POST",
            body: formData,
          });
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error ?? "Book recognition failed.");
          }

          return data as RecognitionResult;
        }),
      );

      const combinedBooks = results.reduce<RecognizedBook[]>(
        (books, result) => mergeBooks(books, result.books),
        [],
      );

      if (combinedBooks.length === 0) {
        setBookRecognitionError(
          "No books were recognized. Try clearer, closer photos.",
        );
        return;
      }

      setRecognizedBooks((current) =>
        mergeBooks(current, combinedBooks),
      );
      setProcessedBookPhotos((current) => [
        ...current,
        ...pendingBookPhotos.map(({ name, url }) => ({ name, url })),
      ]);
      setBookPhotosProcessed((count) => count + pendingBookPhotos.length);
      setPendingBookPhotos([]);
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

  async function handleStepThreePrimaryAction() {
    if (pendingBookPhotos.length > 0) {
      await analyzeAllBookPhotos();
      return;
    }

    await handleSubmit();
  }

  async function handleSubmit() {
    setMessage("");
    setError("");
    setNearbyLibrary(null);

    const contributor =
      currentUser?.email?.trim().toLowerCase() || "Public contributor";

    if (!currentUser) {
      setError(
        "Public access is still loading. Please wait a moment and try again.",
      );
      return;
    }

    const latitudeNumber = Number(latitude);
    const longitudeNumber = Number(longitude);

    if (!name.trim()) {
      setError("Book box name is required.");
      return;
    }

    if (!address.trim()) {
      setError("Address is required.");
      return;
    }

    if (!photo) {
      setError("Please add an exterior photo of the book box.");
      return;
    }

    if (recognizedBooks.length === 0) {
      setError("Please analyze at least one box interior photo.");
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
          `A book box already exists about ${Math.round(
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
          recognitionNotes: `Inventory created from ${bookPhotosProcessed} box interior photo${
            bookPhotosProcessed === 1 ? "" : "s"
          }.`,

          verified,
          photoFile,

          createdBy: contributor,
          createdByUid: currentUser.uid,
          createdByType: currentUser.isAnonymous ? "public" : "google",

          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      } catch (firestoreError) {
        await deleteObject(photoReference).catch((cleanupError) => {
          console.error(
            "Could not remove uploaded photo after the book box save failed:",
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
      setCurrentStep(1);
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
      setLocationAdjusted(false);
      setPendingLibraryId(doc(collection(db, "libraries")).id);
      setNearbyLibrary(null);
      setMapCenter({
        lat: 39.0458,
        lng: -77.1224,
      });

      setMapZoom(18);

      setMessage(
        "Book-sharing location, photo, and book list added successfully.",
      );
    } catch (caughtError) {
      console.error("Could not add book box:", caughtError);

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not add the book box.",
      );
    } finally {
      setUploadingPhoto(false);
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Preparing the public form…
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 p-5">
        {accessMessage && (
          <p className="text-sm text-red-600" role="alert">
            {accessMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <style>{`
        @media (prefers-color-scheme: dark) and (max-width: 639px) {
          .kbs-add-form,
          .kbs-add-step-card,
          .kbs-add-content {
            background-color: #111827 !important;
            background-image: none !important;
            border-color: #334155 !important;
            color: #f8fafc !important;
          }

          .kbs-add-step-label {
            color: #93c5fd !important;
          }

          .kbs-add-step-title {
            color: #f8fafc !important;
          }

          .kbs-add-step-instruction {
            color: #cbd5e1 !important;
          }

          .kbs-add-input {
            background-color: #0f172a !important;
            border-color: #475569 !important;
            color: #f8fafc !important;
          }

          .kbs-add-input::placeholder {
            color: #94a3b8 !important;
          }

          .kbs-add-next:disabled {
            background-color: #1e293b !important;
            border-color: #475569 !important;
            color: #94a3b8 !important;
            opacity: 1 !important;
          }

          .kbs-add-primary:not(:disabled):not([aria-disabled="true"]) {
            background-color: #1e3a8a !important;
            border-color: #3b5998 !important;
            color: #f8fafc !important;
            box-shadow: 0 3px 10px rgba(2, 6, 23, 0.35) !important;
          }

          .kbs-add-primary:not(:disabled):not([aria-disabled="true"]):active {
            background-color: #1e40af !important;
          }

          .kbs-recognize-all:not(:disabled) {
            background-color: #5b21b6 !important;
            border-color: #7c3aed !important;
            color: #faf5ff !important;
            box-shadow: 0 3px 10px rgba(2, 6, 23, 0.35) !important;
          }

          .kbs-recognize-all:not(:disabled):active {
            background-color: #6d28d9 !important;
          }

          .kbs-add-photo-card {
            background-color: #0f172a !important;
            border-color: #475569 !important;
            color: #f8fafc !important;
          }
        }
      `}</style>

      <div className="kbs-add-form min-w-0 overflow-visible rounded-2xl border border-border bg-card p-3 max-sm:[&_button]:text-base max-sm:[&_button_span]:text-base max-sm:[&_input]:text-base max-sm:[&_label]:text-sm max-sm:[&_label_span]:text-sm max-sm:[&_p]:text-sm sm:p-4">
        <div className="border-b border-border pb-3">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            Contributor: {currentUser.email ?? "Public contributor"}
          </p>
        </div>

        <div className="mt-3 grid gap-3">
          <section
            className={currentStep === 1 ? "grid gap-3" : "hidden"}
            aria-labelledby="add-location-step"
          >
            <h2
              id="add-location-step"
              ref={stepOneHeadingRef}
              tabIndex={-1}
              className="sr-only scroll-mt-28"
            >
              Confirm location
            </h2>

            <WizardStepHeader
              step={1}
              title="Confirm Box Location"
              instruction="Move the marker to the exact location of the book box."
              icon={MapPinned}
            />

          <div className="grid gap-1 sm:grid-cols-2 sm:items-end sm:gap-2">
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating || saving}
              className="kbs-add-primary inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-blue-700 bg-blue-600 px-3 font-bold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 max-sm:mb-2 max-sm:!text-sm sm:h-10 sm:px-4 sm:text-sm"
            >
              <span aria-hidden="true">📍</span>
              <span className="truncate max-sm:!text-sm">
                {locating ? "Finding Location…" : "Use My Current Location"}
              </span>
            </button>

            <label className="hidden min-w-0 gap-0 sm:grid sm:gap-1">
              <span className="flex items-center justify-between gap-1 text-xs font-medium">
                <span>Book Box Name</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  Auto
                </span>
              </span>

              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="kbs-add-input h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-base sm:px-2.5 sm:text-xs"
                placeholder="Generated from location"
              />
            </label>
          </div>

          <div className="-mt-2 grid gap-1 sm:mt-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:gap-2">
            <label className="grid min-w-0 gap-0 sm:gap-1">
              <span className="text-xs font-medium">Address</span>

              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="kbs-add-input h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-base sm:px-2.5 sm:text-xs"
                placeholder="123 Main St, Rockville, MD"
              />
            </label>

            <label className="hidden min-w-0 gap-0 sm:grid sm:gap-1">
              <span className="text-xs font-medium">Neighborhood</span>

              <input
                value={neighborhood}
                onChange={(event) => setNeighborhood(event.target.value)}
                className="kbs-add-input h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-base sm:px-2.5 sm:text-xs"
                placeholder="Town Center"
              />
            </label>
          </div>

          {duplicateCheckStatus === "checking" && (
            <div
              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 max-sm:!text-sm max-sm:font-bold max-sm:leading-snug"
              role="status"
            >
              Checking for an existing book box near this location…
            </div>
          )}

          {duplicateCheckStatus === "clear" && (
            <div
              className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-bold text-green-800 max-sm:!text-base max-sm:leading-snug"
              role="status"
            >
              Location confirmed!
            </div>
          )}

          {duplicateCheckStatus === "duplicate" && nearbyLibrary && (
            <div
              className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              role="alert"
            >
              <div className="min-w-0 leading-snug">
                <p className="font-bold">Possible Duplicate Found!</p>
                <p className="font-normal">
                  Move the red marker if this is a different book box.
                </p>
              </div>
            </div>
          )}

          {markerPosition && (
            <div className="overflow-hidden rounded-xl border border-border max-sm:order-4">
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
                      zIndex={10}
                    >
                      <div className="flex flex-col items-center">
                        <div className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                          New Box
                        </div>

                        <div className="h-3 w-3 -translate-y-0.5 rotate-45 bg-red-600" />
                      </div>
                    </AdvancedMarker>

                    {nearbyLibrary && (
                      <AdvancedMarker
                        position={{
                          lat: nearbyLibrary.library.latitude,
                          lng: nearbyLibrary.library.longitude,
                        }}
                        onClick={() =>
                          onUseExistingLibrary?.(nearbyLibrary.library)
                        }
                        title="Existing book box"
                        zIndex={20}
                      >
                        <div
                          className="relative flex size-7 cursor-pointer items-start justify-center"
                          aria-label="Existing book box"
                        >
                          <MapPin
                            className="size-7 fill-blue-600 text-blue-700 drop-shadow-md"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span
                            className="absolute top-[6px] size-2 rounded-full bg-white"
                            aria-hidden="true"
                          />
                        </div>
                      </AdvancedMarker>
                    )}
                  </GoogleMap>
                </APIProvider>
              </div>
            </div>
          )}

            <button
              type="button"
              onClick={() => goToStep(2)}
              disabled={!stepOneComplete || locating || saving}
              className="kbs-add-next kbs-add-primary h-12 rounded-xl border border-blue-700 bg-blue-600 px-4 text-base font-bold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none max-sm:order-5"
            >
              Continue →
            </button>
          </section>

          <section
            className={currentStep === 2 ? "grid gap-3" : "hidden"}
            aria-labelledby="add-photo-step"
          >
            <h2
              id="add-photo-step"
              ref={stepTwoHeadingRef}
              tabIndex={-1}
              className="sr-only scroll-mt-28"
            >
              Add box exterior photo
            </h2>

            <WizardStepHeader
              step={2}
              title="Add Box Exterior Photo"
              instruction="Include the entire box and avoid surrounding private property."
              icon={Camera}
              example="exterior"
            />

          <div
            className={`kbs-add-content grid min-w-0 max-w-full gap-2 overflow-hidden rounded-xl border border-transparent p-2.5 transition sm:p-3 ${
              stepOneComplete
                ? "bg-blue-50/50 text-slate-950"
                : "pointer-events-none bg-gray-50 text-slate-950 opacity-50"
            }`}
          >
            <input
              id="library-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              disabled={saving || processingPhoto || !stepOneComplete}
              className="hidden"
            />

            {!photoPreviewUrl ? (
              <>
                <p className="text-right text-xs text-slate-600">
                  Crop for privacy
                </p>

                <label
                  htmlFor="library-photo"
                  aria-disabled={!stepOneComplete || processingPhoto}
                  className={`kbs-add-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border px-4 text-base font-bold transition sm:h-10 sm:text-sm ${
                    processingPhoto
                      ? "pointer-events-none cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500 shadow-none"
                      : "cursor-pointer border-blue-700 bg-blue-600 text-white shadow-md hover:bg-blue-700"
                  }`}
                >
                  {processingPhoto
                    ? "Optimizing Photo…"
                    : "📷 Add Box Exterior Photo"}
                </label>
              </>
            ) : (
              <div className="w-full min-w-0 max-w-full overflow-hidden">
                <div className="flex w-full min-w-0 max-w-full justify-center gap-2 overflow-x-hidden pb-2 sm:overflow-x-auto sm:overscroll-x-contain sm:pr-1 sm:[scrollbar-width:thin]">
                  <div className="kbs-add-photo-card w-48 shrink-0 overflow-hidden rounded-xl border border-blue-200 bg-white text-slate-950">
                    <img
                      src={photoPreviewUrl}
                      alt="Preview of the book box exterior"
                      className="aspect-[4/5] w-full bg-gray-100 object-contain"
                    />

                    <div className="p-1.5">
                      <div className="flex items-center gap-2.5">
                        <label
                          htmlFor="library-photo"
                          className="cursor-pointer text-[10px] font-medium text-muted-foreground underline underline-offset-2 hover:text-blue-700 max-sm:!text-sm"
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
                          className="text-[10px] font-medium text-muted-foreground underline underline-offset-2 hover:text-red-600 disabled:opacity-50 max-sm:!text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>

            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button
                type="button"
                onClick={() => goToStep(1)}
                disabled={saving}
                className="h-12 rounded-xl border border-border bg-background px-4 text-base font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => goToStep(3)}
                disabled={!stepTwoComplete || saving}
                className="kbs-add-next kbs-add-primary h-12 rounded-xl border border-blue-700 bg-blue-600 px-4 text-base font-bold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
              >
                Continue →
              </button>
            </div>
          </section>

          <section
            className={currentStep === 3 ? "grid gap-3" : "hidden"}
            aria-labelledby="add-shelf-step"
          >
            <h2
              id="add-shelf-step"
              ref={stepThreeHeadingRef}
              tabIndex={-1}
              className="sr-only scroll-mt-28"
            >
              Add box interior photo
            </h2>

            <WizardStepHeader
              step={3}
              title="Add Box Interior Photo"
              instruction="Photograph the books inside the box so their titles are visible."
              icon={ScanLine}
              example="interior"
            />

          <div
            className={`kbs-add-content grid min-w-0 gap-2 overflow-hidden rounded-xl border border-transparent p-3 transition ${
              stepTwoComplete
                ? "bg-violet-50/50 text-slate-950"
                : "pointer-events-none bg-gray-50 text-slate-950 opacity-50"
            }`}
          >
            <input
              id="book-photo"
              type="file"
              accept="image/*"
              onChange={handleBookPhotoChange}
              disabled={saving || analyzingBooks || !stepTwoComplete}
              className="hidden"
            />

            <div className="grid gap-2">
              <label
                htmlFor="book-photo"
                aria-disabled={analyzingBooks || saving}
                className={`kbs-add-primary inline-flex h-12 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-base font-bold transition max-sm:!text-base sm:h-12 sm:px-3 sm:text-sm ${
                  analyzingBooks || saving
                    ? "pointer-events-none cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500 shadow-none"
                    : "cursor-pointer border-blue-700 bg-blue-600 text-white shadow-md hover:bg-blue-700"
                }`}
              >
                📚{" "}
                {bookPhotosProcessed > 0 || pendingBookPhotos.length > 0
                  ? "Add More Interior Photo"
                  : "Add Interior Photos"}
              </label>
            </div>

            {(pendingBookPhotos.length > 0 ||
              recognizedBooks.length > 0) && (
              <button
                type="button"
                onClick={handleStepThreePrimaryAction}
                disabled={
                  pendingBookPhotos.length > 0
                    ? saving || analyzingBooks
                    : saving ||
                      locating ||
                      analyzingBooks ||
                      !stepThreeComplete
                }
                className={`h-12 w-full whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-bold leading-tight text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-50 max-sm:!text-base sm:h-12 ${
                  pendingBookPhotos.length > 0
                    ? "kbs-recognize-all border-violet-700 bg-violet-600 hover:bg-violet-700"
                    : "border-green-800 bg-green-700 hover:bg-green-800"
                }`}
              >
                {analyzingBooks
                  ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <BrainCircuit className="size-5" aria-hidden="true" />
                        AI Recognizing Books in {pendingBookPhotos.length}{" "}
                        Photo{pendingBookPhotos.length === 1 ? "" : "s"}…
                      </span>
                    )
                  : pendingBookPhotos.length > 0
                    ? (
                        <span className="inline-flex items-center justify-center gap-2">
                          <BrainCircuit className="size-5" aria-hidden="true" />
                          AI: Recognize Books in {pendingBookPhotos.length}{" "}
                          Photo{pendingBookPhotos.length === 1 ? "" : "s"}
                        </span>
                      )
                    : uploadingPhoto
                      ? "Uploading Photo…"
                      : saving
                        ? "Adding Location…"
                        : (
                            <span className="whitespace-nowrap">
                              Add This Book Box with {recognizedBooks.length}{" "}
                              Book
                              {recognizedBooks.length === 1 ? "" : "s"}
                            </span>
                          )}
              </button>
            )}

            {(processedBookPhotos.length > 0 ||
              pendingBookPhotos.length > 0) && (
              <div className="grid gap-3 sm:flex sm:overflow-x-auto sm:pb-2">
                {pendingBookPhotos
                  .map((pendingPhoto, index) => ({
                    pendingPhoto,
                    number: processedBookPhotos.length + index + 1,
                  }))
                  .reverse()
                  .map(({ pendingPhoto, number }) => (
                    <div
                      key={pendingPhoto.url}
                      className="kbs-add-photo-card w-full overflow-hidden rounded-xl border border-dashed border-violet-300 bg-white text-slate-950 sm:w-64 sm:shrink-0"
                    >
                      <img
                        src={pendingPhoto.url}
                        alt={`Box interior photo ${number} awaiting recognition`}
                        className="h-40 w-full bg-gray-100 object-contain"
                      />
                      <div className="p-2">
                        <p className="font-semibold">
                          Interior photo {number}
                        </p>
                        <p className="mt-1 font-semibold text-amber-700" role="status">
                          {analyzingBooks
                            ? "AI Recognizing Books…"
                            : "Ready for AI book recognition"}
                        </p>
                      </div>
                    </div>
                  ))}

                {processedBookPhotos
                  .map((bookPhotoPreview, index) => ({
                    bookPhotoPreview,
                    number: index + 1,
                  }))
                  .reverse()
                  .map(({ bookPhotoPreview, number }) => (
                    <div
                      key={bookPhotoPreview.url}
                      className="kbs-add-photo-card w-full overflow-hidden rounded-xl border border-violet-200 bg-white text-slate-950 sm:w-64 sm:shrink-0"
                    >
                      <img
                        src={bookPhotoPreview.url}
                        alt={`Box interior photo ${number}`}
                        className="h-40 w-full bg-gray-100 object-contain"
                      />
                      <div className="p-2">
                        <p className="font-semibold">
                          Interior photo {number}
                        </p>
                        <p className="mt-1 font-semibold text-green-700">
                          Book Recognition Done
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {bookRecognitionError && (
              <p className="text-xs text-red-600" role="alert">
                {bookRecognitionError}
              </p>
            )}

            {(pendingBookPhotos.length > 0 || recognizedBooks.length > 0) && (
              recognizedBooks.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-green-200 bg-green-50">
                  <p className="border-b border-green-200 bg-green-100 px-3 py-2 text-base font-bold text-green-950 max-sm:!text-base sm:py-1.5 sm:text-xs sm:font-semibold">
                    Book Box Inventory
                  </p>
                  <ul className="max-h-64 divide-y divide-green-200 overflow-y-auto text-green-950 sm:max-h-52">
                    {recognizedBooks
                      .slice()
                      .sort((a, b) => a.title.localeCompare(b.title))
                      .map((book, index) => (
                        <li
                          key={normalizeBookTitle(book.title)}
                          className="flex gap-1.5 px-2 py-1"
                        >
                          <span className="shrink-0 text-sm font-semibold leading-tight sm:text-[11px]">
                            {index + 1}.
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold leading-tight">
                              {book.title}
                            </p>
                            {book.author && (
                              <p className="text-[10px] leading-tight text-green-800">
                                {book.author}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-violet-200 bg-white px-3 text-center text-slate-950">
                  <p className="text-xs leading-relaxed text-slate-600">
                    Add interior photos to generate the title list
                  </p>
                </div>
              )
            )}

          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goToStep(2)}
              disabled={saving || analyzingBooks}
              className="min-h-11 w-fit rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold leading-tight text-foreground transition hover:bg-secondary disabled:opacity-50"
            >
              ← Back
            </button>

            <label className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <input
                type="checkbox"
                checked={verified}
                onChange={(event) => setVerified(event.target.checked)}
              />

              <span>Verified by a KBS volunteer</span>
            </label>
          </div>

          </section>

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

      {cropSourceUrl && createPortal(
        <div
          data-book-box-crop-editor
          className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-box-photo-title"
        >
          <div className="grid max-h-[95dvh] w-full max-w-lg gap-3 overflow-y-auto rounded-2xl bg-white p-4 text-slate-950 shadow-2xl">
            <div>
              <h2 id="crop-box-photo-title" className="text-lg font-bold text-slate-950">
                Crop Box Exterior Photo
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Crop closely around the book box and exclude private property when possible.
              </p>
            </div>

            <div className="relative h-[55dvh] max-h-[480px] min-h-72 overflow-hidden rounded-xl bg-black">
              <Cropper
                image={cropSourceUrl}
                crop={cropPosition}
                zoom={cropZoom}
                aspect={4 / 5}
                objectFit="contain"
                showGrid
                onCropChange={setCropPosition}
                onZoomChange={setCropZoom}
                onCropComplete={(_, croppedPixels) =>
                  setCroppedAreaPixels(croppedPixels)
                }
              />
            </div>

            <label className="hidden gap-1 text-sm font-medium text-foreground sm:grid">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={cropZoom}
                onChange={(event) => setCropZoom(Number(event.target.value))}
                className="w-full accent-blue-600"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeCropEditor}
                disabled={processingPhoto}
                className="h-12 rounded-xl border border-border bg-white px-4 font-semibold text-slate-950 hover:bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={useCroppedPhoto}
                disabled={processingPhoto || !croppedAreaPixels}
                className="kbs-add-primary h-12 rounded-xl border border-blue-700 bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processingPhoto ? "Preparing Photo…" : "Use This Crop"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
