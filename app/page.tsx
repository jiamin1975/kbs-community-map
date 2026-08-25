import { ArrowDown, Camera, MapPinned, ScanLine, Search } from "lucide-react"

import { LibraryMapExperience } from "@/components/library-map-experience"
import { SiteHeader } from "@/components/site-header"

const discoverySteps = [
  {
    label: "Find a nearby book-sharing box",
    icon: MapPinned,
    iconClassName: "text-blue-600",
  },
  {
    label: "Photograph the shelf",
    icon: Camera,
    iconClassName: "text-blue-600",
  },
  {
    label: "AI updates the book list",
    icon: ScanLine,
    iconClassName: "text-violet-600",
  },
]

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-7 pt-4 sm:px-6 sm:pt-5 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-x-8 lg:gap-y-5">
          <h1 className="max-w-full text-balance font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl lg:col-span-2 lg:whitespace-nowrap">
            Make Community-Shared Books Easier to Discover
          </h1>

          <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-violet-50 px-4 py-2.5">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700 sm:text-xs">
              Community-Powered Discovery
            </p>
            <p className="mt-1.5 text-base font-semibold leading-tight text-slate-950 sm:mt-3 sm:text-lg">
              <span className="font-bold text-blue-700">One</span>{" "}
              shelf photo helps the
              <span className="hidden sm:inline"> </span>
              <br className="sm:hidden" />
              <span className="font-bold text-blue-700">whole</span> community.
            </p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3 sm:px-3">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700 sm:text-xs">
              How It Works
            </p>

            <ol className="relative mt-2 grid gap-3 sm:mt-3 sm:grid-cols-4 sm:gap-2">
              {discoverySteps.map((step, index) => {
                const Icon = step.icon

                return (
                  <li
                    key={step.label}
                    className="relative flex items-center gap-3 sm:flex-col sm:gap-1.5 sm:text-center"
                  >
                    {index < discoverySteps.length - 1 ? (
                      <ArrowDown
                        className="absolute left-3 top-full z-10 size-3 text-blue-500 sm:hidden"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className="absolute left-[17px] top-9 h-[calc(100%-24px)] border-l-2 border-dashed border-green-400 sm:hidden"
                        aria-hidden="true"
                      />
                    )}

                    <span
                      className={`absolute left-[calc(50%+18px)] top-[18px] hidden h-px w-[calc(100%-34px)] sm:block ${
                        index === discoverySteps.length - 1
                          ? "border-t-2 border-dashed border-green-400"
                          : "bg-blue-300"
                      }`}
                      aria-hidden="true"
                    >
                      {index < discoverySteps.length - 1 && (
                        <span className="absolute -right-px -top-[3px] size-2 rotate-45 border-r border-t border-blue-400" />
                      )}
                    </span>

                    <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white shadow-sm">
                      <Icon
                        className={`size-4.5 ${step.iconClassName}`}
                        aria-hidden="true"
                      />
                    </span>

                    <span className="block text-base font-medium leading-snug text-slate-950 sm:text-sm">
                      {step.label}
                    </span>
                  </li>
                )
              })}

              <li className="relative flex items-center gap-3 sm:flex-col sm:gap-1.5 sm:text-center">
                <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-green-300 bg-white shadow-sm">
                  <Search
                    className="size-4.5 text-green-600"
                    aria-hidden="true"
                  />
                </span>

                <span className="block text-base font-semibold leading-snug text-green-700 sm:text-sm">
                  Search Books
                </span>
              </li>
            </ol>
          </div>
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
