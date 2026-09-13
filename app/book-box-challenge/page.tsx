import Link from "next/link"
import {
  BookOpenText,
  Camera,
  Gift,
  MapPinPlus,
  Send,
} from "lucide-react"

export default function BookBoxChallengePage() {
  return (
    <main className="bg-background">
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-9 sm:px-6 sm:py-12">
          <div className="mx-auto max-w-2xl text-center">
            <div
              className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-700"
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
            <div className="border border-border bg-card p-5 text-center">
              <MapPinPlus
                className="mx-auto size-7 text-blue-700"
                aria-hidden="true"
              />
              <p className="mt-3 font-bold text-foreground">Add 2 Boxes</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add two new book boxes to the map.
              </p>
            </div>

            <div className="border border-border bg-card p-5 text-center">
              <Camera
                className="mx-auto size-7 text-blue-700"
                aria-hidden="true"
              />
              <p className="mt-3 font-bold text-foreground">Send Screenshots</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Send us your two confirmation screenshots.
              </p>
            </div>

            <div className="border border-border bg-card p-5 text-center">
              <BookOpenText
                className="mx-auto size-7 text-blue-700"
                aria-hidden="true"
              />
              <p className="mt-3 font-bold text-foreground">Pick a Book</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an available SAT or AP prep book.
              </p>
            </div>
          </div>

          <div className="mt-7 flex justify-center">
            <Link
              href="/"
              className="rounded-none border border-blue-700 bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Find &amp; Add Book Boxes
            </Link>
          </div>

          <div className="mx-auto mt-7 max-w-2xl border-t border-border pt-5 text-center">
            <p className="text-xs leading-5 text-muted-foreground">
              New, publicly accessible boxes only · One reward per person ·
              While supplies last · U.S. shipping only
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
