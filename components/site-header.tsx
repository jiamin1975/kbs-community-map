import { BookOpenText, Plus, Sparkles } from "lucide-react"

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-1.5 sm:px-6 sm:py-2">
        <div className="flex shrink-0 items-center gap-2">
          <img
            src="/kbs-logo.png"
            alt="Kits Beyond Sound logo"
            className="size-14 rounded-full object-contain sm:size-16"
          />

          <span
            className="flex items-center justify-center text-blue-700"
            aria-hidden="true"
          >
            <Plus className="size-5 sm:size-6" strokeWidth={2.5} />
          </span>

          <span
            className="relative flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:size-14"
            aria-hidden="true"
          >
            <BookOpenText className="size-6 sm:size-7" />
            <Sparkles className="absolute -right-1 -top-1 size-4 fill-amber-300 text-amber-400 drop-shadow-sm sm:size-5" />
          </span>
        </div>

        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-foreground">
            KBS
          </span>
          <span className="font-display text-base font-semibold leading-tight text-foreground sm:text-lg">
            Community-Powered, AI-Assisted Book Sharing
          </span>
        </div>
      </div>
    </header>
  )
}
