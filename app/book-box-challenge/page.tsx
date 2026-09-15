"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { doc, getDoc } from "firebase/firestore"
import {
  BookOpenText,
  Camera,
  Gift,
  MapPinPlus,
  X,
} from "lucide-react"
import { db } from "@/lib/firebase"

type RewardBook = {
  title: string
  author: string
  year: string
  status: "available" | "claimed"
}

export default function BookBoxChallengePage() {
  const [rewardPhotoUrls, setRewardPhotoUrls] = useState<string[]>([])
  const [books, setBooks] = useState<RewardBook[]>([])
  const [loadingRewards, setLoadingRewards] = useState(true)
  const [photoOpen, setPhotoOpen] = useState<string | null>(null)

  useEffect(() => {
    async function loadRewards() {
      try {
        const snapshot = await getDoc(
          doc(db, "siteContent", "bookBoxChallenge"),
        )

        if (!snapshot.exists()) return

        const data = snapshot.data()

        const photoUrls = Array.isArray(data.rewardPhotos)
          ? data.rewardPhotos
              .map((item: unknown) => {
                if (!item || typeof item !== "object") return ""
                const photo = item as Record<string, unknown>
                return typeof photo.url === "string" ? photo.url : ""
              })
              .filter(Boolean)
          : []

        setRewardPhotoUrls(
          photoUrls.length > 0
            ? photoUrls
            : typeof data.rewardPhotoUrl === "string" && data.rewardPhotoUrl
              ? [data.rewardPhotoUrl]
              : [],
        )

        const nextBooks: RewardBook[] = Array.isArray(data.books)
          ? data.books
              .map((item: unknown) => {
                if (!item || typeof item !== "object") return null
                const book = item as Record<string, unknown>
                const title =
                  typeof book.title === "string" ? book.title.trim() : ""
                if (!title) return null

                return {
                  title,
                  author:
                    typeof book.author === "string" ? book.author.trim() : "",
                  year:
                    typeof book.year === "string" ? book.year.trim() : "",
                  status:
                    book.status === "claimed" ? "claimed" : "available",
                } satisfies RewardBook
              })
              .filter((book: RewardBook | null): book is RewardBook => book !== null)
          : []

        setBooks(nextBooks)
      } catch (error) {
        console.error("Could not load challenge rewards:", error)
      } finally {
        setLoadingRewards(false)
      }
    }

    void loadRewards()
  }, [])

  const availableBooks = useMemo(
    () => books.filter((book) => book.status === "available"),
    [books],
  )
  const claimedBooks = useMemo(
    () => books.filter((book) => book.status === "claimed"),
    [books],
  )

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-violet-50/60 to-amber-50/50">
      <section className="border-b border-blue-100">
        <div className="mx-auto max-w-4xl px-4 py-9 sm:px-6 sm:py-12">
          <div className="mx-auto max-w-2xl text-center">
            <div
              className="mx-auto flex size-14 items-center justify-center rounded-full border border-blue-200 bg-white/80 text-blue-700 shadow-sm"
              aria-hidden="true"
            >
              <Gift className="size-6" />
            </div>

            <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
              Book Box Challenge
            </p>

            <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              Add 2 Book Boxes.
              <br />
              Get a Free Study Book.
            </h1>

            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Help grow the map and earn an SAT or AP prep book.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="border border-blue-200 bg-blue-50/80 p-5 text-center shadow-sm">
              <MapPinPlus className="mx-auto size-7 text-violet-700" aria-hidden="true" />
              <p className="mt-3 font-bold text-foreground">Add 2 Boxes</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add two new book boxes to the map.
              </p>
            </div>

            <div className="border border-violet-200 bg-violet-50/80 p-5 text-center shadow-sm">
              <Camera className="mx-auto size-7 text-amber-700" aria-hidden="true" />
              <p className="mt-3 font-bold text-foreground">Send Screenshots</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Send us your two confirmation screenshots.
              </p>
            </div>

            <div className="border border-amber-200 bg-amber-50/80 p-5 text-center shadow-sm">
              <BookOpenText className="mx-auto size-7 text-blue-700" aria-hidden="true" />
              <p className="mt-3 font-bold text-foreground">Pick a Book</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an available SAT or AP prep book.
              </p>
            </div>
          </div>

          <section className="mt-8 border border-blue-200 bg-white/80 p-4 shadow-sm sm:p-5">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
                Step 1
              </p>
              <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">
                See Available Study Books
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tap the photo to enlarge it, then check the list below.
              </p>
            </div>

            {loadingRewards ? (
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Loading available books…
              </p>
            ) : (
              <>
                {rewardPhotoUrls.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {rewardPhotoUrls.map((photoUrl, index) => (
                      <button
                        key={`${photoUrl}-${index}`}
                        type="button"
                        onClick={() => setPhotoOpen(photoUrl)}
                        className="block cursor-zoom-in border border-border bg-white p-2"
                        aria-label={`Enlarge available study books photo ${index + 1}`}
                      >
                        <img
                          src={photoUrl}
                          alt={`Current Book Box Challenge study books ${index + 1}`}
                          className="h-48 w-full object-cover sm:h-56"
                        />
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold">Available Books</h3>
                    <span className="text-xs font-semibold text-green-700">
                      {availableBooks.length} available
                    </span>
                  </div>

                  {availableBooks.length === 0 ? (
                    <p className="mt-3 border border-border p-4 text-sm text-muted-foreground">
                      No books are currently marked available.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {availableBooks.map((book, index) => (
                        <div
                          key={`${book.title}-${index}`}
                          className="flex items-start justify-between gap-3 border border-green-200 bg-green-50/60 p-3"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">
                              {book.title}
                            </p>
                            {(book.author || book.year) && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {[book.author, book.year].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-bold text-green-700">
                            Available
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {claimedBooks.length > 0 && (
                  <div className="mt-6 border-t border-border pt-5">
                    <h3 className="font-bold text-muted-foreground">
                      Claimed Books
                    </h3>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {claimedBooks.map((book, index) => (
                        <div
                          key={`${book.title}-claimed-${index}`}
                          className="flex items-start justify-between gap-3 border border-border bg-muted/30 p-3 opacity-70"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground line-through">
                              {book.title}
                            </p>
                            {(book.author || book.year) && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {[book.author, book.year].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-bold text-muted-foreground">
                            Claimed
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-5 text-center text-xs leading-5 text-muted-foreground sm:text-sm">
                  After adding 2 book boxes, send us your 2 submission screenshots
                  and the name of the available book you would like. Book selection
                  is confirmed after we verify your submissions.
                </p>
              </>
            )}
          </section>

          <div className="mt-7 flex justify-center">
            <Link
              href="/?add=1"
              className="rounded-none border border-blue-700 bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Find &amp; Add Book Boxes
            </Link>
          </div>

          <div className="mx-auto mt-7 max-w-2xl border-t border-blue-200/70 pt-5 text-center">
            <p className="text-xs leading-5 text-muted-foreground">
              New, publicly accessible boxes only · One reward per person ·
              While supplies last · U.S. shipping only
            </p>
          </div>
        </div>
      </section>

      {photoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Available study books photo"
          onClick={() => setPhotoOpen(null)}
        >
          <button
            type="button"
            onClick={() => setPhotoOpen(null)}
            className="absolute right-4 top-4 flex size-10 items-center justify-center bg-white text-black"
            aria-label="Close photo"
          >
            <X className="size-5" />
          </button>

          <img
            src={photoOpen}
            alt="Current Book Box Challenge study books enlarged"
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </main>
  )
}
