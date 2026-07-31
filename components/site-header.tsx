import { BookOpenText } from 'lucide-react'

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          <BookOpenText className="size-5" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-muted-foreground">Kits Beyond Sound</span>
          <span className="font-display text-lg font-semibold leading-tight text-foreground">
            Community Learning Map
          </span>
        </div>
      </div>
    </header>
  )
}
