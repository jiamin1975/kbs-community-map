'use client'

import { Book, Camera, Clock, MapPin, X } from 'lucide-react'
import type { Library } from '@/lib/libraries'

type LibraryCardProps = {
  library: Library
  onClose: () => void
  onUploadPhoto: (library: Library) => void
}

export function LibraryCard({ library, onClose, onUploadPhoto }: LibraryCardProps) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="library-card-title"
      className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border bg-secondary px-5 py-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <MapPin className="size-5" />
          </span>
          <div>
            <h2 id="library-card-title" className="font-display text-lg font-semibold text-foreground">
              {library.name}
            </h2>
            <p className="text-sm text-secondary-foreground">{library.neighborhood}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Close ${library.name} details`}
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="space-y-5 px-5 py-4">
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Book className="size-3.5" aria-hidden="true" />
              Current books
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-foreground">{library.bookCount}</dd>
          </div>
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Clock className="size-3.5" aria-hidden="true" />
              Last updated
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{library.lastUpdated}</dd>
          </div>
        </dl>

        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recently added titles
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {library.books.map((book) => (
              <li
                key={book}
                className="rounded-full border border-border bg-accent px-3 py-1 text-sm text-accent-foreground"
              >
                {book}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={() => onUploadPhoto(library)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Camera className="size-4" aria-hidden="true" />
          Upload Photo
        </button>
      </div>
    </div>
  )
}
