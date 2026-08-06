import { Library, MapPin, Sparkles } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
//import { CommunityMap } from '@/components/community-map'
//import { libraries } from '@/lib/libraries'
//import { BookPhotoTester } from "@/components/book-photo-tester"
import { LibraryMapExperience } from "@/components/library-map-experience"

export default function Page() {
  //const totalBooks = libraries.reduce((sum, l) => sum + l.bookCount, 0)

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-8 sm:px-6">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Free books for every neighborhood
          </p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            Find a little library near you
          </h1>
          <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            Explore community book boxes across town. Select any marker on the map to see what&apos;s
            on the shelf, when it was last refreshed, and share a photo to help keep listings up to
            date.
          </p>


        </section>

        <LibraryMapExperience />



      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <p>
            <span className="font-medium text-foreground">Kits Beyond Sound</span> &mdash; building
            community through shared stories.
          </p>
        </div>
      </footer>
    </div>
  )
}
