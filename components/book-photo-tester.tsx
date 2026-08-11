"use client"

import {
  type ChangeEvent,
  useEffect,
  useState,
} from "react"
import {
  ImageUp,
  LoaderCircle,
  Save,
  X,
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
  const [file, setFile] =
    useState<File | null>(null)

  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null)

  const [result, setResult] =
    useState<RecognitionResult | null>(null)

  const [sessionBooks, setSessionBooks] =
    useState<RecognizedBook[]>([])

  const [photosProcessed, setPhotosProcessed] =
    useState(0)

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile =
      event.target.files?.[0] ?? null

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setFile(selectedFile)
    setResult(null)
    setError("")
    setSaved(false)

    if (selectedFile) {
      setPreviewUrl(
        URL.createObjectURL(selectedFile),
      )
    } else {
      setPreviewUrl(null)
    }
  }

  function clearPhoto() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setFile(null)
    setPreviewUrl(null)
    setResult(null)
    setError("")
  }

  async function analyzePhoto() {
    if (!file) {
      setError(
        "Please choose a photo first.",
      )
      return
    }

    if (!library) {
      setError(
        "Please select a library first.",
      )
      return
    }

    setLoading(true)
    setError("")
    setResult(null)
    setSaved(false)

    try {
      const formData = new FormData()

      formData.append("image", file)
      formData.append(
        "libraryId",
        library.id,
      )

      const response = await fetch(
        "/api/analyze-books",
        {
          method: "POST",
          body: formData,
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ??
            "The book recognition request failed.",
        )
      }

      const recognitionResult =
        data as RecognitionResult

      setResult(recognitionResult)

      if (
        recognitionResult.books.length === 0
      ) {
        setError(
          "No books were recognized clearly enough in this photo.",
        )
        return
      }

      setSessionBooks(
        (currentBooks) =>
          mergeBooks(
            currentBooks,
            recognitionResult.books,
          ),
      )

      setPhotosProcessed(
        (count) => count + 1,
      )
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
    <div className="p-1">
      {library ? (
        <div className="rounded-lg border border-border bg-secondary px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-base">
              📍
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold leading-tight">
                {library.name}
              </p>

              {library.address && (
                <p className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
                  {library.address}
                </p>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-6 border-t border-border/60 pt-2 text-sm">
            <span>
              📷{" "}
              <strong>{photosProcessed}</strong>{" "}
              Photos
            </span>

            <span>
              📚{" "}
              <strong>{sessionBooks.length}</strong>{" "}
              Books
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="text-sm text-muted-foreground">
            Select a library before updating inventory.
          </p>
        </div>
      )}

      {!saved && (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {/* LEFT SIDE */}
          <div>
            <input
              id="book-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={loading || saving}
              className="hidden"
            />

            <div className="flex gap-3">
              <label
                htmlFor="book-photo"
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium hover:bg-secondary"
              >
                📷 Choose Photo
              </label>

              <button
                type="button"
                onClick={analyzePhoto}
                disabled={
                  !file ||
                  !library ||
                  loading ||
                  saving ||
                  !!result
                }
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  result
                    ? "border border-border bg-secondary text-muted-foreground disabled:opacity-100"
                    : "bg-primary text-primary-foreground disabled:opacity-50"
                }`}
              >
                {loading ? (
                  <>
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    Analyzing…
                  </>
                ) : result ? (
                  <>
                    ✓ Analyzed
                  </>
                ) : (
                  <>
                    <ImageUp
                      className="size-4"
                      aria-hidden="true"
                    />
                    Analyze Photo
                  </>
                )}
              </button>
            </div>

            {previewUrl && (
              <div className="relative mt-3">
                <img
                  src={previewUrl}
                  alt="Selected bookshelf preview"
                  className="max-h-[400px] w-full rounded-xl border border-border object-contain"
                />

                <button
                  type="button"
                  onClick={clearPhoto}
                  disabled={loading}
                  aria-label="Remove selected photo"
                  className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-full bg-background shadow"
                >
                  <X
                    className="size-4"
                    aria-hidden="true"
                  />
                </button>
              </div>
            )}

            {sessionBooks.length > 0 && (
              <div className="mt-4 rounded-xl border border-border bg-card p-3">
                <p className="text-sm font-semibold">
                  Finished photographing this library?
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  This will replace the previous
                  inventory with{" "}
                  {sessionBooks.length} unique books
                  from this update.
                </p>

                <button
                  type="button"
                  onClick={
                    finishAndSaveInventory
                  }
                  disabled={saving}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Saving Inventory…
                    </>
                  ) : (
                    <>
                      <Save
                        className="size-4"
                        aria-hidden="true"
                      />
                      Finish & Save Inventory
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT SIDE */}
          <div
            className="rounded-xl border border-border bg-background p-4"
            aria-live="polite"
          >
            <h3 className="text-sm font-semibold text-foreground">
              Recognition Results
            </h3>

            {!loading && !result && (
              <p className="mt-2 text-xs text-muted-foreground">
                Books from the current photo will appear here.
              </p>
            )}

            {loading && (
              <p className="mt-2 text-xs text-muted-foreground">
                Reading visible titles and authors…
              </p>
            )}

            {result && (
              <div className="mt-2 max-h-[400px] overflow-y-auto pr-2">
                {result.books.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No book titles could be identified confidently.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-green-700">
                      {result.books.length}{" "}
                      {result.books.length === 1
                        ? "book was"
                        : "books were"}{" "}
                      added to this update.
                    </p>

                    <ul className="mt-3 space-y-2">
                      {result.books.map(
                        (book, index) => (
                          <li
                            key={`${book.title}-${index}`}
                            className="rounded-lg border border-border px-3 py-2"
                          >
                            <p className="text-sm font-medium leading-tight text-foreground">
                              {book.title}
                            </p>

                            {book.author && (
                              <p className="mt-0.5 text-xs leading-tight text-muted-foreground">
                                {book.author}
                              </p>
                            )}

                            <p className="mt-1 text-[11px] capitalize text-muted-foreground">
                              Confidence:{" "}
                              {book.confidence}
                            </p>

                            {book.visibleText && (
                              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                                Visible text:{" "}
                                {book.visibleText}
                              </p>
                            )}
                          </li>
                        ),
                      )}
                    </ul>

                    {result.notes && (
                      <div className="mt-3 rounded-lg bg-secondary p-2.5">
                        <p className="text-xs font-medium">
                          Notes
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {result.notes}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {saved && (
        <div
          className="mt-4 rounded-xl border border-green-300 bg-green-50 p-3 text-green-900"
          role="status"
        >
          <p className="text-sm font-semibold">
            Inventory updated successfully
          </p>

          <p className="mt-1 text-xs">
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
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}