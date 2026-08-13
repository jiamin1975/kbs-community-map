import { Sparkles } from "lucide-react"

import { LibraryMapExperience } from "@/components/library-map-experience"
import { SiteHeader } from "@/components/site-header"

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-8 sm:px-6">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Community-powered book sharing
          </p>

          <h1 className="mt-4 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            Find a book near you
          </h1>

          <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            Search by title or author, find the nearest little library that has
            it, and help neighbors keep each library&apos;s inventory up to date.
          </p>
        </section>

        <LibraryMapExperience />
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <p>
            <span className="font-medium text-foreground">
              Kits Beyond Sound
            </span>{" "}
            &mdash; building community through shared stories.
          </p>
        </div>
      </footer>
    </div>
  )
}
