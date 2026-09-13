import Link from "next/link"

export default function BookBoxChallengePage() {
  return (
    <main className="bg-background">
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
            Book Box Challenge
          </p>

          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
            Add 2 Book Boxes. Get a Free Study Book.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Help grow our Community Learning Map and make free books easier to
            find. Add two new community book boxes to the map, and after we
            verify them, you can choose an available SAT or AP prep book.
            We&apos;ll mail it to you for free.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="border border-border bg-card p-5">
              <p className="text-sm font-bold text-blue-700">1 — Find &amp; Add</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Find two publicly accessible book boxes that aren&apos;t already
                on our map. Add their locations, exterior photos, and photos of
                the books inside.
              </p>
            </div>

            <div className="border border-border bg-card p-5">
              <p className="text-sm font-bold text-blue-700">
                2 — Send Your Screenshots
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                After both boxes are successfully added, take screenshots of
                the confirmation pages and send them to Kits Beyond Sound.
              </p>
            </div>

            <div className="border border-border bg-card p-5">
              <p className="text-sm font-bold text-blue-700">3 — Pick Your Book</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Once we verify both submissions, choose from the available SAT
                or AP prep books. We&apos;ll mail one to you for free.
              </p>
            </div>
          </div>

          <div className="mt-8 border border-border bg-muted/30 p-5">
            <h2 className="font-display text-lg font-bold text-foreground">
              Challenge Rules
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Boxes must be real, publicly accessible, and not already listed
              on the Community Learning Map. Both submissions must be verified.
              One free book per person while supplies last. Available titles
              vary. U.S. shipping only.
            </p>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-none border border-blue-700 bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Find &amp; Add Book Boxes
            </Link>
            <Link
              href="/"
              className="rounded-none border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Back to Map
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
