import { Camera, MapPinned, ScanLine } from "lucide-react"

import { LibraryMapExperience } from "@/components/library-map-experience"
import { SiteHeader } from "@/components/site-header"

const discoverySteps = [
  {
    label: "Find a nearby library",
    icon: MapPinned,
    iconClassName: "text-blue-600",
  },
  {
    label: "Photograph the shelf",
    icon: Camera,
    iconClassName: "text-blue-600",
  },
  {
    label: "AI updates the inventory",
    icon: ScanLine,
    iconClassName: "text-violet-600",
  },
]

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-7 pt-4 sm:px-6 sm:pt-5 lg:grid-cols-[1.35fr_1fr] lg:items-center lg:gap-x-10 lg:gap-y-5">
          <h1 className="max-w-full text-balance font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl lg:col-span-2 lg:whitespace-nowrap">
            Make Community Library Resources Easier to Discover
          </h1>

          <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-violet-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
              Community-Powered Discovery
            </p>
           <p className="mt-1.5 text-sm font-medium leading-snug text-foreground sm:text-base">
  <span className="font-bold text-blue-700">One</span> shelf photo helps the{" "}
  <span className="font-bold text-blue-700">whole</span> community.
</p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3.5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
              How It Works
            </p>

            <ol className="relative mt-3 grid gap-3 sm:grid-cols-3 sm:gap-2">
              {discoverySteps.map((step, index) => {
                const Icon = step.icon

                return (
                  <li
                    key={step.label}
                    className="relative flex items-center gap-3 sm:flex-col sm:gap-1.5 sm:text-center"
                  >
                    {index < discoverySteps.length - 1 && (
                      <>
                        <span
                          className="absolute left-[17px] top-9 h-[calc(100%+0.75rem)] w-px bg-blue-200 sm:hidden"
                          aria-hidden="true"
                        />
                        <span
                          className="absolute left-[calc(50%+18px)] top-[18px] hidden h-px w-[calc(100%-28px)] bg-blue-200 sm:block"
                          aria-hidden="true"
                        />
                      </>
                    )}

                    <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white shadow-sm">
                      <Icon
                        className={`size-4.5 ${step.iconClassName}`}
                        aria-hidden="true"
                      />
                    </span>

                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-600">
                        Step {index + 1}
                      </span>
                      <span className="block text-sm font-medium leading-snug text-foreground">
                        {step.label}
                      </span>
                    </span>
                  </li>
                )
              })}
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
