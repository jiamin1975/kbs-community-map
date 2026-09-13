"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

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

  const [challengeMode, setChallengeMode] = useState(false)
  const [challengeCompleted, setChallengeCompleted] = useState(0)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    if (params.get("challenge") === "1") {
      setChallengeMode(true)

      const savedCount = Number(
        window.sessionStorage.getItem("kbsBookBoxChallengeCount") ?? "0",
      )
      setChallengeCompleted(
        Number.isFinite(savedCount) ? Math.min(Math.max(savedCount, 0), 2) : 0,
      )
      setAddLibraryDialogOpen(true)
    }
  }, [])

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
    setChallengeMode(false)
    setChallengeCompleted(0)
    setAddLibraryDialogOpen(true)
  }

  function handleLibraryAdded(library: Library) {
    // The box has been saved, but keep the Add dialog open
    // so the Thank You screen remains visible.
    setPendingAddedLibrary(library)

    if (challengeMode) {
      setChallengeCompleted((current) => {
        const next = Math.min(current + 1, 2)
        window.sessionStorage.setItem(
          "kbsBookBoxChallengeCount",
          String(next),
        )
        return next
      })
    }
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

      <section
        aria-label="Book Box Challenge"
        className="border-b border-border bg-background"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-sm text-muted-foreground">
            Add 2 book boxes and get a free SAT or AP study book.
          </p>
          <Link
            href="/book-box-challenge"
            className="shrink-0 rounded-none border border-blue-700 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Book Box Challenge
          </Link>
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
            challengeMode={challengeMode}
            challengeCompleted={challengeCompleted}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
