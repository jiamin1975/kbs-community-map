import {
  BookOpen,
  Camera,
  MapPinned,
  ScanLine,
} from "lucide-react"

import { LibraryMapExperience } from "@/components/library-map-experience"
import { SiteHeader } from "@/components/site-header"

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-7 pt-8 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:items-center lg:gap-x-10 lg:gap-y-5">
          <h1 className="max-w-full text-balance font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl lg:col-span-2 lg:whitespace-nowrap">
            Make Hidden Educational Resources Easier to Find
          </h1>

          <p className="max-w-3xl text-pretty text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
            Photograph the books inside a community library. AI identifies
            the titles and updates a shared inventory so more families can
            discover and use them.
          </p>

          <ul className="grid grid-cols-1 gap-2 text-sm text-foreground min-[420px]:grid-cols-2">
            <li className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
              <MapPinned className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
              <span>Find nearby libraries</span>
            </li>
            <li className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
              <Camera className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
              <span>Photograph library books</span>
            </li>
            <li className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
              <ScanLine className="size-4 shrink-0 text-violet-600" aria-hidden="true" />
              <span>AI recognizes books</span>
            </li>
            <li className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
              <BookOpen className="size-4 shrink-0 text-green-600" aria-hidden="true" />
              <span>Find free books</span>
            </li>
          </ul>
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
