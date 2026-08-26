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

  // Used when refreshing an existing book box's inventory
  const [selectedLibrary, setSelectedLibrary] =
    useState<Library | null>(null)

  // Tells CommunityMap which book box card to open
  const [newlyAddedLibrary, setNewlyAddedLibrary] =
    useState<Library | null>(null)

  const [uploadDialogOpen, setUploadDialogOpen] =
    useState(false)

  const [addLibraryDialogOpen, setAddLibraryDialogOpen] =
    useState(false)

  useEffect(() => {
    return () => {
      if (existingBoxFocusTimer.current !== null) {
        window.clearTimeout(existingBoxFocusTimer.current)
      }
    }
  }, [])

  function handleUploadPhoto(library: Library) {
    setSelectedLibrary(library)
    setUploadDialogOpen(true)
  }

  function handleUploadDialogChange(open: boolean) {
    setUploadDialogOpen(open)

    if (!open) {
      setSelectedLibrary(null)
    }
  }

  function handleAddLibrary() {
    setAddLibraryDialogOpen(true)
  }

  function handleLibraryAdded(library: Library) {
    // Step 3 already created the first inventory.
    // Close the form and open the new book box's
    // information card on the map.
    setNewlyAddedLibrary(library)
    setAddLibraryDialogOpen(false)
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

      {/* Update the inventory for an existing book box */}
      <Dialog
        open={uploadDialogOpen}
        onOpenChange={handleUploadDialogChange}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Update Book Box Inventory</DialogTitle>
          </DialogHeader>

          {selectedLibrary && (
            <BookPhotoTester
              key={selectedLibrary.id}
              library={selectedLibrary}
              onFinished={() => handleUploadDialogChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create a book box and its first inventory */}
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
