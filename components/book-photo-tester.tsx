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
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
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
  books: RecognizedBook[]
}

type PendingBookPhoto = {
  file: File
  url: string
}

type BookPhotoTesterProps = {
  library: Library | null
  onFinished?: (updatedLibrary: Library) => void
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


function getBookSearchWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function buildBookSearchTokens(books: any[]) {
  return [
    ...new Set(
      books.flatMap((book) => {
        const title =
          typeof book === "string"
            ? book
            : typeof book?.title === "string"
              ? book.title
              : "";
        const author =
          typeof book === "object" &&
          book !== null &&
          typeof book.author === "string"
            ? book.author
            : "";
        return getBookSearchWords(`${title} ${author}`);
      }),
    ),
  ];
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
  const [updatedBy, setUpdatedBy] = useState("Public contributor")

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
    const selectedFiles = Array.from(event.target.files ?? [])

    event.target.value = ""

    setError("")
    setSaved(false)

    if (selectedFiles.length === 0) {
      return
    }

    const nextPhotos = selectedFiles.map((file) => {
      const url = URL.createObjectURL(file)
      processedBookPhotoUrls.current.push(url)
      return { file, url }
    })

    setPendingBookPhotos((currentPhotos) => [
      ...currentPhotos,
      ...nextPhotos,
    ])
  }

  function removePendingBookPhoto(url: string) {
    setPendingBookPhotos((currentPhotos) =>
      currentPhotos.filter((photo) => photo.url !== url),
    )
    URL.revokeObjectURL(url)
    processedBookPhotoUrls.current =
      processedBookPhotoUrls.current.filter((item) => item !== url)
  }

  function removeProcessedBookPhoto(url: string) {
    setProcessedBookPhotos((currentPhotos) => {
      const nextPhotos = currentPhotos.filter((photo) => photo.url !== url)
      const nextBooks = nextPhotos.reduce<RecognizedBook[]>(
        (books, photo) => mergeBooks(books, photo.books),
        [],
      )
      setSessionBooks(nextBooks)
      setPhotosProcessed(nextPhotos.length)
      return nextPhotos
    })
    URL.revokeObjectURL(url)
    processedBookPhotoUrls.current =
      processedBookPhotoUrls.current.filter((item) => item !== url)
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

      const newlyProcessed: ProcessedBookPhoto[] =
        pendingBookPhotos.map((photo, index) => ({
          url: photo.url,
          books: results[index]?.books ?? [],
        }))

      setProcessedBookPhotos((currentPhotos) => {
        const nextPhotos = [...currentPhotos, ...newlyProcessed]
        const nextBooks = nextPhotos.reduce<RecognizedBook[]>(
          (books, photo) => mergeBooks(books, photo.books),
          [],
        )
        setSessionBooks(nextBooks)
        setPhotosProcessed(nextPhotos.length)
        return nextPhotos
      })
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

      await setDoc(
        doc(db, "libraries", library.id, "inventory", "current"),
        {
          books: booksToSave,
          bookCount: booksToSave.length,
          recognitionNotes:
            `Book List created from ${photosProcessed} photo${
              photosProcessed === 1
                ? ""
                : "s"
            }.`,
          lastUpdated: serverTimestamp(),
        },
        { merge: true },
      )

      await setDoc(
        doc(db, "bookSearch", library.id),
        {
          libraryId: library.id,
          name: library.name,
          address: library.address ?? "",
          books: booksToSave,
          searchTokens: buildBookSearchTokens(booksToSave),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      await updateDoc(
        libraryReference,
        {
          bookCount: booksToSave.length,
          lastUpdated: serverTimestamp(),
          updatedBy: updatedBy.trim() || null,

          // If this is an older box, remove the large legacy fields from
          // the parent document after the new inventory has been saved.
          books: deleteField(),
          recognitionNotes: deleteField(),
        },
      )

      const updatedLibrary = {
        ...library,
        books: booksToSave,
        bookCount: booksToSave.length,
        updatedBy: updatedBy.trim() || null,
      } as Library

      setSaved(true)
      onFinished?.(updatedLibrary)
    } catch (caughtError) {
      console.error(
        "Could not save book list:",
        caughtError,
      )

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save the book list.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="kbs-update-root min-w-0 p-1">
      <style>{`
        @media (prefers-color-scheme: dark) and (max-width: 639px) {
          .kbs-update-step-card {
            background-color: #111827 !important;
            border-color: #334155 !important;
            color: #f8fafc !important;
          }

          .kbs-update-step-instruction {
            color: #cbd5e1 !important;
          }

          .kbs-update-root {
            color: #f8fafc !important;
          }

          .kbs-update-location {
            background-color: #111827 !important;
            background-image: none !important;
            border-color: #334155 !important;
            color: #f8fafc !important;
          }

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

          .kbs-update-recognize-all:not(:disabled) {
            background-color: #5b21b6 !important;
            border-color: #7c3aed !important;
            color: #faf5ff !important;
            box-shadow: 0 3px 10px rgba(2, 6, 23, 0.35) !important;
          }

          .kbs-update-recognize-all:not(:disabled):active {
            background-color: #6d28d9 !important;
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

          .kbs-update-book list {
            background-color: #0f1f1a !important;
            border-color: #166534 !important;
            color: #dcfce7 !important;
          }

          .kbs-update-book list-header {
            background-color: #14532d !important;
            border-color: #166534 !important;
            color: #f0fdf4 !important;
          }

          .kbs-update-book list-list,
          .kbs-update-book list-list > :not([hidden]) ~ :not([hidden]) {
            border-color: #166534 !important;
            color: #dcfce7 !important;
          }

          .kbs-update-book list-list li::marker,
          .kbs-update-book list-author,
          .kbs-update-book list-empty {
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

      {library && !saved ? (
        <div className="kbs-update-location mt-3 rounded-none border border-border bg-secondary px-4 py-3">
          <div className="mb-3 border-b border-border pb-3">
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              Contributor: {updatedBy || "Public contributor"}
            </p>
          </div>

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
      ) : !library ? (
        <div className="rounded-none border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">
            Select a library before updating book list.
          </p>
        </div>
      ) : null}

      {!saved && (
        <div className="kbs-update-workspace mt-3 grid min-w-0 gap-3 overflow-hidden rounded-none border border-border bg-card p-3">
<div className="kbs-update-step-card grid gap-2 rounded-none border border-blue-100 bg-blue-50/60 p-3 text-slate-950">
            <p className="kbs-update-step-instruction text-sm leading-snug text-slate-600">
              Photograph the books inside the box so their titles are visible.
            </p>

            <div
              className="relative h-24 overflow-hidden rounded-none border border-blue-200 bg-transparent sm:h-32"
              aria-label="Box interior photo example"
            >
              <img
                src="/examples/book-box-interior.jpg"
                alt="Example of a book box interior photo showing the books"
                className="h-full w-full object-contain"
              />

              <div className="pointer-events-none absolute left-1/2 top-3/4 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-none bg-black/65 px-3 py-1.5 text-center sm:inset-x-0 sm:bottom-0 sm:top-auto sm:translate-x-0 sm:translate-y-0 sm:bg-black/65 sm:px-3 sm:py-1.5">
                <p className="text-xs font-bold uppercase leading-tight tracking-normal text-white sm:text-xs sm:leading-tight sm:tracking-wider">
                  <span>Example - Take photo like this</span>
                </p>
              </div>
            </div>
          </div>

          <input
            id="update-book-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
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
              📷 {photosProcessed > 0 || pendingBookPhotos.length > 0
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
                  ? "kbs-update-recognize-all border-violet-700 bg-violet-600 hover:bg-violet-700"
                  : "kbs-update-save border-green-800 bg-green-700 hover:bg-green-800"
              }`}
            >
              {pendingBookPhotos.length > 0 ? (
                loading
                  ? "Recognizing Books…"
                  : `✨ AI: Recognize books in ${pendingBookPhotos.length} photo${pendingBookPhotos.length === 1 ? "" : "s"}`
              ) : saving ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Saving Book List…
                </>
              ) : (
                <span className="inline-flex flex-col items-center justify-center gap-1 leading-tight">
                  <span className="font-bold">
                    Update &amp; Save
                  </span>
                  <span className="text-sm font-normal leading-tight opacity-95 max-sm:!text-sm">
                    (box with <strong>{sessionBooks.length}</strong>{" "}
                    book{sessionBooks.length === 1 ? "" : "s"})
                  </span>
                </span>
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
                      <button
                        type="button"
                        onClick={() => removePendingBookPhoto(photo.url)}
                        disabled={loading || saving}
                        className="mt-1 text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
                      >
                        Remove
                      </button>
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
                        <button
                          type="button"
                          onClick={() => removeProcessedBookPhoto(photo.url)}
                          disabled={loading || saving}
                          className="mt-1 text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
                        >
                          Remove
                        </button>
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
                      <button
                        type="button"
                        onClick={() => removePendingBookPhoto(photo.url)}
                        disabled={loading || saving}
                        className="mt-1 text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
                      >
                        Remove
                      </button>
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
                      <button
                        type="button"
                        onClick={() => removeProcessedBookPhoto(photo.url)}
                        disabled={loading || saving}
                        className="mt-1 text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="kbs-update-book list overflow-hidden rounded-none border border-green-200 bg-green-50" aria-live="polite">
            <p className="kbs-update-book list-header border-b border-green-200 bg-green-100 px-3 py-2 text-base font-bold text-green-950 max-sm:!text-base sm:py-1.5 sm:text-xs sm:font-semibold">
              Book List
            </p>

            {sessionBooks.length > 0 ? (
              <ol className="kbs-update-book list-list max-h-64 list-decimal divide-y divide-green-200 overflow-y-auto pl-9 pr-2 text-green-950 marker:font-bold marker:text-green-700 sm:max-h-52 sm:pl-8">
                {sessionBooks
                  .slice()
                  .sort((firstBook, secondBook) =>
                    firstBook.title.localeCompare(secondBook.title),
                  )
                  .map((book) => (
                    <li key={normalizeBookTitle(book.title)} className="py-2 pl-1 sm:py-1">
                      <p className="text-base font-semibold leading-tight sm:text-[11px]">{book.title}</p>
                      {book.author && (
                        <p className="kbs-update-book list-author mt-1 text-sm leading-tight text-green-800 sm:mt-0 sm:text-[10px]">
                          {book.author}
                        </p>
                      )}
                    </li>
                  ))}
              </ol>
            ) : (
              <div className="flex h-24 items-center justify-center px-3 text-center">
                <p className="kbs-update-book list-empty text-sm leading-relaxed text-muted-foreground">
                  Add interior photos to generate the title list.
                </p>
              </div>
            )}
          </div>
</div>
      )}

      {saved && library && (
        <div
          className="kbs-update-success flex min-h-[58vh] items-center justify-center rounded-none border border-border bg-card px-4 py-10 text-slate-950 sm:min-h-[420px] sm:px-8"
          role="status"
        >
          <div className="w-full max-w-md overflow-hidden rounded-none border border-green-200 bg-white shadow-sm">
            <div className="border-b border-green-100 bg-green-50 px-5 py-7 text-center sm:px-8 sm:py-8">
              <div
                className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-600 text-2xl font-bold text-white shadow-sm"
                aria-hidden="true"
              >
                ✓
              </div>

              <p className="text-2xl font-bold tracking-tight text-slate-950">
                Thank you!
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                This book box has been updated successfully.
              </p>
            </div>

            <div className="border-b border-slate-200 px-5 py-4 sm:px-7">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 shrink-0 text-base"
                    aria-hidden="true"
                  >
                    📍
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">
                      Location
                    </p>
                    <p className="mt-0.5 text-sm font-medium leading-snug text-slate-900">
                      {library.address || library.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-lg leading-none"
                    aria-hidden="true"
                  >
                    📖
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">
                      Books
                    </p>
                    <p className="mt-0.5 text-sm font-medium leading-snug text-slate-900">
                      {sessionBooks.length}{" "}
                      book{sessionBooks.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-4 text-center">
              <p className="text-xs leading-relaxed text-slate-500">
                Close this window to return to the map.
              </p>
            </div>
          </div>
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
