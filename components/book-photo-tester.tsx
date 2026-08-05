"use client"

import {
  type ChangeEvent,
  useEffect,
  useState,
} from "react"
import {
  ImageUp,
  LoaderCircle,
  X,
} from "lucide-react"

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
}

export function BookPhotoTester({
  library,
}: BookPhotoTesterProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null)
  const [result, setResult] =
    useState<RecognitionResult | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

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
      setError("Please choose a photo first.")
      return
    }

    if (!library) {
      setError(
        "Please select a library from the map first.",
      )
      return
    }

    setLoading(true)
    setError("")
    setResult(null)

    try {
      const formData = new FormData()

      formData.append("image", file)
      formData.append("libraryId", library.id)

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

      setResult(data)
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

  return (
    <section
      id="book-photo-tester"
      className="mx-auto max-w-6xl px-4 py-10 sm:px-6"
    >
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <h2 className="text-2xl font-semibold text-foreground">
          Test AI Book Recognition
        </h2>

        <p className="mt-2 max-w-2xl text-muted-foreground">
          Upload a clear photo of book covers or
          spines. The AI will identify titles that
          are sufficiently visible.
        </p>

        {library ? (
          <div className="mt-5 rounded-xl border border-border bg-secondary p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Updating inventory for
            </p>

            <p className="mt-1 text-lg font-semibold">
              {library.name}
            </p>

            <p className="text-sm text-muted-foreground">
              {library.address}
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-border p-4">
            <p className="text-sm text-muted-foreground">
              Select a library marker and click
              <strong> Upload Photo </strong>
              to begin updating its inventory.
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <label
              htmlFor="book-photo"
              className="block text-sm font-medium text-foreground"
            >
              Choose a book photo
            </label>

            <input
              id="book-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={loading}
              className="mt-2 block w-full rounded-xl border border-border bg-background p-3 text-sm"
            />

            {previewUrl && (
              <div className="relative mt-4">
                <img
                  src={previewUrl}
                  alt="Selected bookshelf preview"
                  className="max-h-[450px] w-full rounded-xl border border-border object-contain"
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

            <button
              type="button"
              onClick={analyzePhoto}
              disabled={!file || !library || loading}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                  Analyzing photo…
                </>
              ) : (
                <>
                  <ImageUp
                    className="size-4"
                    aria-hidden="true"
                  />
                  Update Library Inventory
                </>
              )}
            </button>

            {error && (
              <p
                className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          <div
            className="rounded-xl border border-border bg-background p-5"
            aria-live="polite"
          >
            <h3 className="font-semibold text-foreground">
              Recognition results
            </h3>

            {!loading && !result && (
              <p className="mt-3 text-sm text-muted-foreground">
                The identified books will appear
                here.
              </p>
            )}

            {loading && (
              <p className="mt-3 text-sm text-muted-foreground">
                Reading visible titles and authors…
              </p>
            )}

            {result && (
              <>
                {result.books.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No book titles could be identified
                    confidently.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {result.books.map(
                      (book, index) => (
                        <li
                          key={`${book.title}-${index}`}
                          className="rounded-lg border border-border p-3"
                        >
                          <p className="font-medium text-foreground">
                            {book.title}
                          </p>

                          {book.author && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {book.author}
                            </p>
                          )}

                          <p className="mt-2 text-xs capitalize text-muted-foreground">
                            Confidence:{" "}
                            {book.confidence}
                          </p>

                          {book.visibleText && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Visible text:{" "}
                              {book.visibleText}
                            </p>
                          )}
                        </li>
                      ),
                    )}
                  </ul>
                )}

                {result.notes && (
                  <div className="mt-4 rounded-lg bg-secondary p-3">
                    <p className="text-sm font-medium text-secondary-foreground">
                      Notes
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {result.notes}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}