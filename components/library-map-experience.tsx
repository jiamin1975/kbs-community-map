"use client"

import { useState } from "react"

import { AddLibraryForm } from "@/components/add-library-form"
import { BookPhotoTester } from "@/components/book-photo-tester"
import { CommunityMap } from "@/components/community-map"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Library } from "@/lib/libraries"

export function LibraryMapExperience() {
  const [selectedLibrary, setSelectedLibrary] =
    useState<Library | null>(null)

  const [uploadDialogOpen, setUploadDialogOpen] =
    useState(false)

  const [addLibraryDialogOpen, setAddLibraryDialogOpen] =
    useState(false)

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
    setAddLibraryDialogOpen(false)

    // Open the first-inventory modal immediately
    // for the newly created library.
    setSelectedLibrary(library)
    setUploadDialogOpen(true)
  }

  return (
    <>
      <section
        aria-label="Interactive library map"
        className="border-y border-border"
      >
        <CommunityMap
          onUploadPhoto={handleUploadPhoto}
          onAddLibrary={handleAddLibrary}
        />
      </section>

      <Dialog
        open={uploadDialogOpen}
        onOpenChange={handleUploadDialogChange}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Update Library Inventory
            </DialogTitle>

            <DialogDescription>
              Upload a clear photo of the visible books.
              AI will identify readable titles for review.
            </DialogDescription>
          </DialogHeader>

          {selectedLibrary && (
            <BookPhotoTester
              key={selectedLibrary.id}
              library={selectedLibrary}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={addLibraryDialogOpen}
        onOpenChange={setAddLibraryDialogOpen}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Add a New Library
            </DialogTitle>

            <DialogDescription>
              Use your current location, adjust the
              marker if needed, and add the library to
              the community map.
            </DialogDescription>
          </DialogHeader>

          <AddLibraryForm
            onLibraryAdded={handleLibraryAdded}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}