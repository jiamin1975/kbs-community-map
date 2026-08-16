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
  name: string
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
  const [file, setFile] =
    useState<File | null>(null)

  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null)

  const [result, setResult] =
    useState<RecognitionResult | null>(null)

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

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setFile(selectedFile)

    // New file = new current recognition result,
    // but keep all session books already found.
    setResult(null)
    setError("")
    setSaved(false)

    if (selectedFile) {
      const nextPreviewUrl = URL.createObjectURL(selectedFile)
      processedBookPhotoUrls.current.push(nextPreviewUrl)
      setPreviewUrl(nextPreviewUrl)
    } else {
      setPreviewUrl(null)
    }
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
        setResult(null)
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

      if (previewUrl) {
        setProcessedBookPhotos((currentPhotos) => [
          ...currentPhotos,
          {
            name: file.name,
            url: previewUrl,
          },
        ])
      }

      setFile(null)
      setPreviewUrl(null)
      setResult(null)
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
    <div className="min-w-0 p-1">
      {library ? (
        <div className="rounded-xl border border-border bg-secondary px-4 py-3">
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
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">
            Select a library before updating inventory.
          </p>
        </div>
      )}

      {!saved && (
        <div className="mt-3 grid min-w-0 gap-3 overflow-hidden rounded-xl bg-violet-50/50 p-3">
          <div className="flex flex-col items-start gap-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="text-xs leading-normal text-muted-foreground max-sm:!text-sm">
              AI will recognize the visible titles.
            </p>
            {sessionBooks.length > 0 && (
              <p className="text-xs font-medium leading-normal text-green-700 max-sm:!text-sm">
                ✓ {sessionBooks.length} book
                {sessionBooks.length === 1 ? "" : "s"} found
              </p>
            )}
          </div>

          <input
            id="update-book-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={loading || saving}
            className="hidden"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <label
              htmlFor="update-book-photo"
              className="inline-flex h-12 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-blue-700 bg-blue-600 px-3 text-base font-bold text-white shadow-md transition hover:bg-blue-700 sm:h-10 sm:px-2 sm:text-sm"
            >
              📚 {photosProcessed > 0 ? "Choose Another Photo" : "Choose Book Photo"}
            </label>

            <button
              type="button"
              onClick={analyzePhoto}
              disabled={!file || !library || loading || saving || !!result}
              className="inline-flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-violet-700 bg-violet-600 px-3 text-base font-bold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none sm:h-10 sm:px-2 sm:text-sm"
            >
              {loading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Recognizing…
                </>
              ) : result ? (
                "✓ Recognition Done"
              ) : (
                "✨ Recognize Books"
              )}
            </button>
          </div>

          {(processedBookPhotos.length > 0 || previewUrl) && (
            <>
              <div className="grid min-w-0 gap-3 sm:hidden">
                <p className="text-sm font-semibold text-muted-foreground">
                  Book photos
                </p>

                {previewUrl && file && (
                  <div
                    className="w-full overflow-hidden rounded-xl border border-dashed border-violet-300 bg-background"
                  >
                    <img
                      src={previewUrl}
                      alt="Book photo awaiting recognition"
                      className="h-40 w-full bg-gray-100 object-cover"
                    />
                    <div className="p-2">
                      <p className="font-semibold">
                        Book photo {processedBookPhotos.length + 1}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {file.name}
                      </p>
                    </div>
                  </div>
                )}

                {processedBookPhotos
                  .map((photo, index) => ({
                    photo,
                    number: index + 1,
                  }))
                  .reverse()
                  .map(({ photo, number }) => (
                    <div
                      key={photo.url}
                      className="w-full overflow-hidden rounded-xl border border-violet-200 bg-background"
                    >
                      <img
                        src={photo.url}
                        alt={`Book photo ${number}`}
                        className="h-40 w-full bg-gray-100 object-cover"
                      />
                      <div className="p-2">
                        <p className="font-semibold">Book photo {number}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {photo.name}
                        </p>
                        <p className="mt-1 font-semibold text-green-700">
                          ✓ Recognition Done
                        </p>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="hidden min-w-0 gap-3 overflow-x-auto pb-2 sm:flex">
                {processedBookPhotos.map((photo, index) => (
                  <div
                    key={photo.url}
                    className="w-52 shrink-0 overflow-hidden rounded-xl border border-violet-200 bg-background"
                  >
                    <img
                      src={photo.url}
                      alt={`Book photo ${index + 1}`}
                      className="h-40 w-full bg-gray-100 object-cover"
                    />
                    <div className="p-2.5">
                      <p className="font-semibold">Book photo {index + 1}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {photo.name}
                      </p>
                      <p className="mt-1 font-semibold text-green-700">
                        ✓ Recognition Done
                      </p>
                    </div>
                  </div>
                ))}

                {previewUrl && file && (
                  <div className="w-52 shrink-0 overflow-hidden rounded-xl border border-dashed border-violet-300 bg-background">
                    <img
                      src={previewUrl}
                      alt="Book photo awaiting recognition"
                      className="h-40 w-full bg-gray-100 object-cover"
                    />
                    <div className="p-2.5">
                      <p className="font-semibold">
                        Book photo {processedBookPhotos.length + 1}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {file.name}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="overflow-hidden rounded-lg border border-green-200 bg-green-50" aria-live="polite">
            <p className="border-b border-green-200 bg-green-100 px-3 py-2 text-base font-bold text-green-950 max-sm:!text-base sm:py-1.5 sm:text-xs sm:font-semibold">
              Library Inventory
            </p>

            {sessionBooks.length > 0 ? (
              <ul className="max-h-64 divide-y divide-green-200 overflow-y-auto text-green-950 sm:max-h-52">
                {sessionBooks
                  .slice()
                  .sort((firstBook, secondBook) =>
                    firstBook.title.localeCompare(secondBook.title),
                  )
                  .map((book) => (
                    <li key={normalizeBookTitle(book.title)} className="px-3 py-2 sm:px-2 sm:py-1">
                      <p className="text-base font-semibold leading-tight sm:text-[11px]">{book.title}</p>
                      {book.author && (
                        <p className="mt-1 text-sm leading-tight text-green-800 sm:mt-0 sm:text-[10px]">
                          {book.author}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            ) : (
              <div className="flex h-24 items-center justify-center px-3 text-center">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Choose a book photo, then select Recognize Books.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="inventory-updated-by"
              className="shrink-0 text-xs font-medium text-muted-foreground"
            >
              Contributor name <span className="font-normal">(optional)</span>
            </label>
            <input
              id="inventory-updated-by"
              type="text"
              value={updatedBy}
              onChange={(event) => setUpdatedBy(event.target.value)}
              maxLength={60}
              placeholder="Your name"
              disabled={saving}
              className="h-8 w-40 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-48"
            />
          </div>

          <button
            type="button"
            onClick={finishAndSaveInventory}
            disabled={saving || sessionBooks.length === 0}
            className="h-12 rounded-xl border border-green-800 bg-green-700 px-4 text-base font-bold text-white shadow-md transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Saving Inventory…
              </>
            ) : (
              `Update Library with ${sessionBooks.length} Book${
                sessionBooks.length === 1 ? "" : "s"
              }`
            )}
          </button>
        </div>
      )}

      {saved && (
        <div
          className="mt-5 rounded-xl border border-green-300 bg-green-50 p-4 text-green-900"
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
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
