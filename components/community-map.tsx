'use client'

import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { libraries, type Library } from '@/lib/libraries'
import { cn } from '@/lib/utils'
import { LibraryCard } from '@/components/library-card'

export function CommunityMap() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')

  const selected = libraries.find((l) => l.id === selectedId) ?? null

  function handleUploadPhoto(library: Library) {
    setStatus(`Photo upload started for ${library.name}. (Demo only — no file was sent.)`)
  }

  return (
    <div className="relative">
      {/* Map surface */}
      <div
        className="relative h-[62vh] min-h-[420px] w-full overflow-hidden bg-[oklch(0.93_0.03_230)]"
        role="application"
        aria-label="Community learning map showing little library locations"
      >
        {/* Placeholder map tiles: streets + blocks */}
        <div aria-hidden="true" className="absolute inset-0">
          {/* park / water blocks */}
          <div className="absolute left-[6%] top-[10%] size-40 rounded-2xl bg-[oklch(0.9_0.06_150)]" />
          <div className="absolute right-[8%] bottom-[8%] h-48 w-64 rounded-2xl bg-[oklch(0.88_0.05_220)]" />
          <div className="absolute left-[40%] top-[46%] h-28 w-36 rounded-xl bg-[oklch(0.9_0.06_150)]" />
          {/* road grid */}
          <div
            className="absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                'linear-gradient(to right, oklch(0.98 0.01 240) 0 6px, transparent 6px), linear-gradient(to bottom, oklch(0.98 0.01 240) 0 6px, transparent 6px)',
              backgroundSize: '110px 110px',
            }}
          />
          {/* diagonal avenue */}
          <div className="absolute -left-10 top-1/3 h-2.5 w-[130%] rotate-6 bg-[oklch(0.98_0.01_240)]" />
        </div>

        {/* Markers */}
        {libraries.map((library) => {
          const isActive = library.id === selectedId
          return (
            <button
              key={library.id}
              type="button"
              onClick={() => setSelectedId(library.id)}
              style={{ top: `${library.position.top}%`, left: `${library.position.left}%` }}
              className={cn(
                'group absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center focus-visible:outline-none',
              )}
              aria-pressed={isActive}
              aria-label={`${library.name}, ${library.bookCount} books, updated ${library.lastUpdated}`}
            >
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border-2 border-card shadow-md transition-transform group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2',
                  isActive ? 'bg-primary text-primary-foreground scale-110' : 'bg-card text-primary',
                )}
              >
                <MapPin className="size-5" aria-hidden="true" />
              </span>
              <span
                className={cn(
                  'mt-1 max-w-[8rem] truncate rounded-md px-2 py-0.5 text-xs font-medium shadow-sm',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card/95 text-foreground',
                )}
              >
                {library.name}
              </span>
            </button>
          )
        })}

        {/* Placeholder attribution to mimic Google Maps chrome */}
        <span className="absolute bottom-2 right-3 rounded bg-card/80 px-2 py-0.5 text-[11px] text-muted-foreground">
          Map placeholder
        </span>
      </div>

      {/* Selected library card overlay */}
      {selected && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center p-4 sm:items-start sm:justify-end sm:p-6">
          <div className="pointer-events-auto w-full max-w-sm">
            <LibraryCard
              library={selected}
              onClose={() => setSelectedId(null)}
              onUploadPhoto={handleUploadPhoto}
            />
          </div>
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {status && (
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <p className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-secondary-foreground">
            {status}
          </p>
        </div>
      )}
    </div>
  )
}
