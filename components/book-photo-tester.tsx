"use client"

import {
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  LoaderCircle,
} from "lucide-react"
import {
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore"

import { db } from "@/lib/firebase"
import type { Library } from "@/lib/libraries"

type RecognizedBook = {
  title: string
  author: string | null
  confidence: "high" | "medium" | "low"
  visibleText: string | null
}

type RecognitionResult = {
  books: RecognizedBook[]
  notes: string
}

type ProcessedBookPhoto = {
  url: string
}

type PendingBookPhoto = {
  file: File
  url: string
}

type BookPhotoTesterProps = {
  library: Library | null
  onFinished?: () => void
}

function normalizeBookTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function mergeBooks(
  existing: RecognizedBook[],
  incoming: RecognizedBook[],
) {
  const merged = new Map<string, RecognizedBook>()

  for (const book of existing) {
    merged.set(
      normalizeBookTitle(book.title),
      book,
    )
  }

  for (const book of incoming) {
    const key = normalizeBookTitle(book.title)

    if (!key) {
      continue
    }

    const existingBook = merged.get(key)

    if (!existingBook) {
      merged.set(key, book)
      continue
    }

    merged.set(key, {
      ...existingBook,
      author:
        existingBook.author ??
        book.author,
      visibleText:
        existingBook.visibleText ??
        book.visibleText,
      confidence:
        existingBook.confidence === "high"
          ? "high"
          : book.confidence,
    })
  }

  return Array.from(merged.values())
}

export function BookPhotoTester({
  library,
  onFinished,
}: BookPhotoTesterProps) {
  const [pendingBookPhotos, setPendingBookPhotos] =
    useState<PendingBookPhoto[]>([])

  const [sessionBooks, setSessionBooks] =
    useState<RecognizedBook[]>([])

  const [processedBookPhotos, setProcessedBookPhotos] =
    useState<ProcessedBookPhoto[]>([])

  const processedBookPhotoUrls = useRef<string[]>([])

  const [photosProcessed, setPhotosProcessed] =
    useState(0)

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [updatedBy, setUpdatedBy] = useState("")

  useEffect(() => {
    return () => {
      processedBookPhotoUrls.current.forEach((url) =>
        URL.revokeObjectURL(url),
      )
    }
  }, [])

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile =
      event.target.files?.[0] ?? null

    event.target.value = ""

    setError("")
    setSaved(false)

    if (selectedFile) {
      const nextPreviewUrl = URL.createObjectURL(selectedFile)
      processedBookPhotoUrls.current.push(nextPreviewUrl)
      setPendingBookPhotos((currentPhotos) => [
        ...currentPhotos,
        { file: selectedFile, url: nextPreviewUrl },
      ])
    }
  }

  async function analyzeAllPhotos() {
    if (!library) {
      setError(
        "Please select a book box first.",
      )
      return
    }

    if (pendingBookPhotos.length === 0) {
      setError("Add at least one interior photo before recognizing books.")
      return
    }

    setLoading(true)
    setError("")
    setSaved(false)

    try {
      const results = await Promise.all(
        pendingBookPhotos.map(async ({ file }) => {
          const formData = new FormData()
          formData.append("image", file)
          formData.append("libraryId", library.id)

          const response = await fetch("/api/analyze-books", {
            method: "POST",
            body: formData,
          })
          const data = await response.json()

          if (!response.ok) {
            throw new Error(
              data.error ?? "The book recognition request failed.",
            )
          }

          return data as RecognitionResult
        }),
      )

      const combinedBooks = results.reduce<RecognizedBook[]>(
        (books, result) => mergeBooks(books, result.books),
        [],
      )

      if (combinedBooks.length === 0) {
        setError("No books were recognized. Try clearer, closer photos.")
        return
      }

      setSessionBooks((currentBooks) =>
        mergeBooks(currentBooks, combinedBooks),
      )
      setPhotosProcessed((count) => count + pendingBookPhotos.length)
      setProcessedBookPhotos((currentPhotos) => [
        ...currentPhotos,
        ...pendingBookPhotos.map(({ url }) => ({ url })),
      ])
      setPendingBookPhotos([])
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The book recognition request failed.",
      )
    } finally {
      setLoading(false)
    }
  }

  async function finishAndSaveInventory() {
    if (!library) {
      setError(
        "Please select a library first.",
      )
      return
    }

    if (sessionBooks.length === 0) {
      setError(
        "Add at least one photo to this update before saving.",
      )
      return
    }

    setSaving(true)
    setSaved(false)
    setError("")

    try {
      const libraryReference = doc(
        db,
        "libraries",
        library.id,
      )

      const booksToSave =
        sessionBooks.map((book) => ({
          title: book.title,
          author: book.author,
          confidence: book.confidence,
          visibleText: book.visibleText,
        }))

      await updateDoc(
        libraryReference,
        {
          books: booksToSave,
          bookCount: booksToSave.length,
          lastUpdated:
            serverTimestamp(),
          recognitionNotes:
            `Inventory created from ${photosProcessed} photo${
              photosProcessed === 1
                ? ""
                : "s"
            }.`,
          updatedBy: updatedBy.trim() || null,
        },
      )

      setSaved(true)

      if (onFinished) {
        window.setTimeout(() => {
          onFinished()
        }, 1000)
      }
    } catch (caughtError) {
      console.error(
        "Could not save inventory:",
        caughtError,
      )

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save the inventory.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="kbs-update-root min-w-0 p-1">
      <style>{`
        @media (prefers-color-scheme: dark) and (max-width: 639px) {
          .kbs-update-root {
            color: #f8fafc !important;
          }

          .kbs-update-location,
          .kbs-update-workspace {
            background-color: #111827 !important;
            background-image: none !important;
            border-color: #334155 !important;
            color: #f8fafc !important;
          }

          .kbs-update-primary:not([aria-disabled="true"]) {
            background-color: #1e3a8a !important;
            border-color: #3b5998 !important;
            color: #f8fafc !important;
            box-shadow: 0 3px 10px rgba(2, 6, 23, 0.35) !important;
          }

          .kbs-update-primary[aria-disabled="true"] {
            background-color: #1e293b !important;
            border-color: #475569 !important;
            color: #94a3b8 !important;
          }

          .kbs-update-save:not(:disabled) {
            background-color: #166534 !important;
            border-color: #22824c !important;
            color: #f0fdf4 !important;
            box-shadow: none !important;
          }

          .kbs-update-save:disabled {
            background-color: #1e293b !important;
            border-color: #475569 !important;
            color: #94a3b8 !important;
            opacity: 1 !important;
            box-shadow: none !important;
          }

          .kbs-update-photo-card {
            background-color: #0f172a !important;
            border-color: #475569 !important;
            color: #f8fafc !important;
          }

          .kbs-update-photo-card img {
            background-color: #111827 !important;
          }

          .kbs-update-recognizing {
            color: #fcd34d !important;
          }

          .kbs-update-recognized {
            color: #86efac !important;
          }

          .kbs-update-inventory {
            background-color: #0f1f1a !important;
            border-color: #166534 !important;
            color: #dcfce7 !important;
          }

          .kbs-update-inventory-header {
            background-color: #14532d !important;
            border-color: #166534 !important;
            color: #f0fdf4 !important;
          }

          .kbs-update-inventory-list,
          .kbs-update-inventory-list > :not([hidden]) ~ :not([hidden]) {
            border-color: #166534 !important;
            color: #dcfce7 !important;
          }

          .kbs-update-inventory-list li::marker,
          .kbs-update-inventory-author,
          .kbs-update-inventory-empty {
            color: #86efac !important;
          }

          .kbs-update-contributor {
            background-color: #0f172a !important;
            border-color: #475569 !important;
            color: #f8fafc !important;
          }

          .kbs-update-contributor::placeholder {
            color: #94a3b8 !important;
          }

          .kbs-update-success {
            background-color: #0f2d22 !important;
            border-color: #166534 !important;
            color: #bbf7d0 !important;
          }

          .kbs-update-error {
            background-color: #3f171b !important;
            border-color: #991b1b !important;
            color: #fecaca !important;
          }
        }
      `}</style>

      {library ? (
        <div className="kbs-update-location rounded-none border border-border bg-secondary px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 shrink-0 text-base">📍</span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-base font-semibold leading-tight">
                {library.name}
              </p>
              {library.address && (
                <p className="mt-1 break-words text-sm leading-tight text-muted-foreground">
                  {library.address}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-none border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">
            Select a library before updating inventory.
          </p>
        </div>
      )}

      {!saved && (
        <div className="kbs-update-workspace mt-3 grid min-w-0 gap-3 overflow-hidden rounded-none border border-transparent bg-violet-50/50 p-3">
          <input
            id="update-book-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={loading || saving}
            className="hidden"
          />

          <div className="grid gap-2">
            <label
              htmlFor="update-book-photo"
              aria-disabled={loading || saving}
              className={`kbs-update-primary inline-flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-none border px-3 text-base font-bold transition sm:h-10 sm:px-2 sm:text-sm ${
                loading || saving
                  ? "pointer-events-none cursor-not-allowed border-gray-300 bg-gray-200 text-gray-500 shadow-none"
                  : "cursor-pointer border-blue-700 bg-blue-600 text-white shadow-md hover:bg-blue-700"
              }`}
            >
              📚 {photosProcessed > 0 || pendingBookPhotos.length > 0
                ? "Add More Interior Photos"
                : "Add Interior Photos"}
            </label>
          </div>

          {(pendingBookPhotos.length > 0 || sessionBooks.length > 0) && (
            <button
              type="button"
              onClick={
                pendingBookPhotos.length > 0
                  ? analyzeAllPhotos
                  : finishAndSaveInventory
              }
              disabled={loading || saving}
              className={`inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-none border px-3 py-1.5 text-base font-bold leading-tight text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm ${
                pendingBookPhotos.length > 0
                  ? "kbs-update-primary border-violet-800 bg-violet-700 hover:bg-violet-800"
                  : "kbs-update-save border-green-800 bg-green-700 hover:bg-green-800"
              }`}
            >
              {pendingBookPhotos.length > 0 ? (
                loading
                  ? "Recognizing Books…"
                  : `AI Recognize Books in ${pendingBookPhotos.length} Photo${pendingBookPhotos.length === 1 ? "" : "s"}`
              ) : saving ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Saving Inventory…
                </>
              ) : (
                <>
                  <span className="sm:hidden">
                    <span className="block">Update Book Box</span>
                    <span className="block">
                      with {sessionBooks.length} Book
                      {sessionBooks.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="hidden sm:inline">
                    Update Book Box with {sessionBooks.length} Book
                    {sessionBooks.length === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </button>
          )}

          {(processedBookPhotos.length > 0 || pendingBookPhotos.length > 0) && (
            <>
              <div className="grid min-w-0 gap-3 sm:hidden">
                {pendingBookPhotos
                  .map((photo, index) => ({
                    photo,
                    number: processedBookPhotos.length + index + 1,
                  }))
                  .reverse()
                  .map(({ photo, number }) => (
                  <div
                    key={photo.url}
                    className="kbs-update-photo-card w-full overflow-hidden rounded-none border border-dashed border-violet-300 bg-background"
                  >
                    <img
                      src={photo.url}
                      alt={`Interior photo ${number} awaiting recognition`}
                      className="h-40 w-full bg-gray-100 object-contain"
                    />
                    <div className="p-2">
                      <p className="font-semibold">
                        Interior photo {number}
                      </p>
                      <p className="kbs-update-recognizing mt-1 font-semibold text-amber-700" role="status">
                        {loading ? "Recognizing Books…" : "Ready to recognize"}
                      </p>
                    </div>
                  </div>
                ))}

                {processedBookPhotos
                  .map((photo, index) => ({
                    photo,
                    number: index + 1,
                  }))
                  .reverse()
                  .map(({ photo, number }) => (
                    <div
                      key={photo.url}
                      className="kbs-update-photo-card w-full overflow-hidden rounded-none border border-violet-200 bg-background"
                    >
                      <img
                        src={photo.url}
                        alt={`Interior photo ${number}`}
                        className="h-40 w-full bg-gray-100 object-contain"
                      />
                      <div className="p-2">
                        <p className="font-semibold">Interior photo {number}</p>
                        <p className="kbs-update-recognized mt-1 font-semibold text-green-700">
                          Recognition Done
                        </p>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="hidden min-w-0 gap-3 overflow-x-auto pb-2 sm:flex">
                {pendingBookPhotos
                  .map((photo, index) => ({
                    photo,
                    number: processedBookPhotos.length + index + 1,
                  }))
                  .reverse()
                  .map(({ photo, number }) => (
                  <div
                    key={photo.url}
                    className="kbs-update-photo-card w-52 shrink-0 overflow-hidden rounded-none border border-dashed border-violet-300 bg-background"
                  >
                    <img
                      src={photo.url}
                      alt={`Interior photo ${number} awaiting recognition`}
                      className="h-40 w-full bg-gray-100 object-contain"
                    />
                    <div className="p-2.5">
                      <p className="font-semibold">Interior photo {number}</p>
                      <p className="kbs-update-recognizing mt-1 font-semibold text-amber-700" role="status">
                        {loading ? "Recognizing Books…" : "Ready to recognize"}
                      </p>
                    </div>
                  </div>
                ))}

                {processedBookPhotos
                  .map((photo, index) => ({
                    photo,
                    number: index + 1,
                  }))
                  .reverse()
                  .map(({ photo, number }) => (
                  <div key={photo.url} className="kbs-update-photo-card w-52 shrink-0 overflow-hidden rounded-none border border-violet-200 bg-background">
                    <img
                      src={photo.url}
                      alt={`Interior photo ${number}`}
                      className="h-40 w-full bg-gray-100 object-contain"
                    />
                    <div className="p-2.5">
                      <p className="font-semibold">Interior photo {number}</p>
                      <p className="kbs-update-recognized mt-1 font-semibold text-green-700">
                        Recognition Done
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="kbs-update-inventory overflow-hidden rounded-none border border-green-200 bg-green-50" aria-live="polite">
            <p className="kbs-update-inventory-header border-b border-green-200 bg-green-100 px-3 py-2 text-base font-bold text-green-950 max-sm:!text-base sm:py-1.5 sm:text-xs sm:font-semibold">
              Box Inventory
            </p>

            {sessionBooks.length > 0 ? (
              <ol className="kbs-update-inventory-list max-h-64 list-decimal divide-y divide-green-200 overflow-y-auto pl-9 pr-2 text-green-950 marker:font-bold marker:text-green-700 sm:max-h-52 sm:pl-8">
                {sessionBooks
                  .slice()
                  .sort((firstBook, secondBook) =>
                    firstBook.title.localeCompare(secondBook.title),
                  )
                  .map((book) => (
                    <li key={normalizeBookTitle(book.title)} className="py-2 pl-1 sm:py-1">
                      <p className="text-base font-semibold leading-tight sm:text-[11px]">{book.title}</p>
                      {book.author && (
                        <p className="kbs-update-inventory-author mt-1 text-sm leading-tight text-green-800 sm:mt-0 sm:text-[10px]">
                          {book.author}
                        </p>
                      )}
                    </li>
                  ))}
              </ol>
            ) : (
              <div className="flex h-24 items-center justify-center px-3 text-center">
                <p className="kbs-update-inventory-empty text-sm leading-relaxed text-muted-foreground">
                  Add interior photos to generate the title list.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <label htmlFor="inventory-updated-by" className="sr-only">
              Contributor name (optional)
            </label>
            <input
              id="inventory-updated-by"
              type="text"
              value={updatedBy}
              onChange={(event) => setUpdatedBy(event.target.value)}
              maxLength={60}
              placeholder="Contributor name (optional)"
              disabled={saving}
              className="kbs-update-contributor h-8 w-56 rounded-lg border border-border/80 bg-card px-2.5 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

        </div>
      )}

      {saved && (
        <div
          className="kbs-update-success mt-5 rounded-none border border-green-300 bg-green-50 p-4 text-green-900"
          role="status"
        >
          <p className="font-semibold">
            Inventory updated successfully
          </p>

          <p className="mt-1 text-sm">
            {sessionBooks.length} unique{" "}
            {sessionBooks.length === 1
              ? "book was"
              : "books were"}{" "}
            saved from{" "}
            {photosProcessed}{" "}
            {photosProcessed === 1
              ? "photo"
              : "photos"}.
          </p>
        </div>
      )}

      {error && (
        <p
          className="kbs-update-error mt-4 rounded-none border border-red-300 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
