"use client"

import { useEffect, useRef, useState } from "react"

import { AddLibraryForm } from "@/components/add-library-form"
import { BookPhotoTester } from "@/components/book-photo-tester"
import { CommunityMap } from "@/components/community-map"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Library } from "@/lib/libraries"

export function LibraryMapExperience() {
  const existingBoxFocusTimer = useRef<number | null>(null)

  // Used when refreshing an existing book box's book list
  const [selectedLibrary, setSelectedLibrary] =
    useState<Library | null>(null)

  // Tells CommunityMap which book box card to open
  const [newlyAddedLibrary, setNewlyAddedLibrary] =
    useState<Library | null>(null)

  // A newly created box waits here while the Thank You screen is visible.
  // It is focused only after the user closes the Add a New Book Box dialog.
  const [pendingAddedLibrary, setPendingAddedLibrary] =
    useState<Library | null>(null)

  const [uploadDialogOpen, setUploadDialogOpen] =
    useState(false)

  // Holds the freshly updated box while the Thank You screen remains open.
  // When the dialog closes, CommunityMap receives this exact new Book List
  // instead of continuing to display its previously selected in-memory copy.
  const [pendingUpdatedLibrary, setPendingUpdatedLibrary] =
    useState<Library | null>(null)

  const [addLibraryDialogOpen, setAddLibraryDialogOpen] =
    useState(false)

  const [challengeDetailsOpen, setChallengeDetailsOpen] =
    useState(false)

  useEffect(() => {
    return () => {
      if (existingBoxFocusTimer.current !== null) {
        window.clearTimeout(existingBoxFocusTimer.current)
      }
    }
  }, [])

  function handleUploadPhoto(library: Library) {
    setPendingUpdatedLibrary(null)
    setSelectedLibrary(library)
    setUploadDialogOpen(true)
  }

  function handleUploadDialogChange(open: boolean) {
    setUploadDialogOpen(open)

    if (!open) {
      if (pendingUpdatedLibrary) {
        setNewlyAddedLibrary({ ...pendingUpdatedLibrary })
        setPendingUpdatedLibrary(null)
      }

      setSelectedLibrary(null)
    }
  }

  function handleBookBoxUpdated(updatedLibrary: Library) {
    // Keep the Thank You screen open. The new Book List is passed to the
    // main map only when the visitor closes this dialog.
    setPendingUpdatedLibrary(updatedLibrary)
  }

  function handleAddLibrary() {
    setAddLibraryDialogOpen(true)
  }

  function handleLibraryAdded(library: Library) {
    // The box has been saved, but keep the Add dialog open
    // so the Thank You screen remains visible.
    setPendingAddedLibrary(library)
  }

  function handleUseExistingLibrary(library: Library) {
    // Let the dialog's embedded map finish unmounting before
    // moving and opening the main map. This avoids a mobile
    // Google Maps loading race between the two map instances.
    setAddLibraryDialogOpen(false)

    if (existingBoxFocusTimer.current !== null) {
      window.clearTimeout(existingBoxFocusTimer.current)
    }

    const focusDelay = window.matchMedia("(max-width: 639px)").matches
      ? 350
      : 50

    existingBoxFocusTimer.current = window.setTimeout(() => {
      setNewlyAddedLibrary({ ...library })
      existingBoxFocusTimer.current = null
    }, focusDelay)
  }

  function handleAddLibraryDialogChange(open: boolean) {
    if (
      !open &&
      document.querySelector("[data-book-box-crop-editor]")
    ) {
      return
    }

    setAddLibraryDialogOpen(open)

    if (!open && pendingAddedLibrary) {
      // After the visitor closes the Thank You dialog,
      // return to and open the newly added book box on the main map.
      setNewlyAddedLibrary({ ...pendingAddedLibrary })
      setPendingAddedLibrary(null)
    }
  }

  return (
    <>
      <section
        aria-label="Search and update community book box inventories"
        className="border-y border-border"
      >
        <CommunityMap
          onUploadPhoto={handleUploadPhoto}
          onAddLibrary={handleAddLibrary}
          focusedLibrary={newlyAddedLibrary}
        />
      </section>

      <section id="book-box-challenge" aria-labelledby="book-box-challenge-title" className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Book Box Challenge</p>
          <div className="mt-2 max-w-3xl">
            <h2 id="book-box-challenge-title" className="font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">
              Add 2 Book Boxes. Get a Free Study Book.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Help grow our Community Learning Map and make free books easier to find. Add <strong className="text-foreground">2 new book boxes</strong> to the map, and we&apos;ll send you a free SAT or AP prep book.
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="border border-border bg-card p-4">
              <p className="text-sm font-bold text-blue-700">1 — Find &amp; Add</p>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">Find two community book boxes that aren&apos;t already on our map. Add their locations and photos of the boxes and books inside.</p>
            </div>
            <div className="border border-border bg-card p-4">
              <p className="text-sm font-bold text-blue-700">2 — Send Your Screenshots</p>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">After adding both boxes, screenshot your successful submissions and email them to Kits Beyond Sound.</p>
            </div>
            <div className="border border-border bg-card p-4">
              <p className="text-sm font-bold text-blue-700">3 — Pick Your Book</p>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">Once we verify your two boxes, choose from our available SAT or AP prep books. We&apos;ll mail one to you for free.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" onClick={handleAddLibrary} className="rounded-none border border-blue-700 bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
              + Add a New Book Box
            </button>
            <button type="button" onClick={() => setChallengeDetailsOpen((open) => !open)} aria-expanded={challengeDetailsOpen} className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
              {challengeDetailsOpen ? "Hide reward details & rules" : "View reward details & rules"}
            </button>
          </div>

          {challengeDetailsOpen && (
            <div className="mt-4 max-w-4xl border border-border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground sm:text-sm">
              Boxes must be real, publicly accessible, and not already listed on the Community Learning Map. Both submissions must be verified. One free book per person while supplies last. Available titles vary. U.S. shipping only.
            </div>
          )}
        </div>
      </section>

      {/* Update the book list for an existing book box */}
      <Dialog
        open={uploadDialogOpen}
        onOpenChange={handleUploadDialogChange}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none max-sm:left-2 max-sm:right-2 max-sm:top-2 max-sm:h-[calc(100dvh-1rem)] max-sm:max-h-[calc(100dvh-1rem)] max-sm:w-auto max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:p-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Update Book Box</DialogTitle>
          </DialogHeader>

          {selectedLibrary && (
            <BookPhotoTester
              key={selectedLibrary.id}
              library={selectedLibrary}
              onFinished={handleBookBoxUpdated}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create a book box and its first book list */}
      <Dialog
        open={addLibraryDialogOpen}
        onOpenChange={handleAddLibraryDialogChange}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto rounded-none max-sm:left-2 max-sm:right-2 max-sm:top-2 max-sm:h-[calc(100dvh-1rem)] max-sm:max-h-[calc(100dvh-1rem)] max-sm:w-auto max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:p-3 sm:max-w-3xl"
          onInteractOutside={(event) => {
            const target = event.target

            if (
              target instanceof Element &&
              target.closest("[data-book-box-crop-editor]")
            ) {
              event.preventDefault()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a New Book Box</DialogTitle>
          </DialogHeader>

          <AddLibraryForm
            onLibraryAdded={handleLibraryAdded}
            onUseExistingLibrary={handleUseExistingLibrary}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
