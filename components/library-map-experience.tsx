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
  // Used when refreshing an existing library's inventory
  const [selectedLibrary, setSelectedLibrary] =
    useState<Library | null>(null)

  // Tells CommunityMap which library card to open
  const [newlyAddedLibrary, setNewlyAddedLibrary] =
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
    // Step 3 already created the first inventory.
    // Close the form and open the new library's
    // information card on the map.
    setNewlyAddedLibrary(library)
    setAddLibraryDialogOpen(false)
  }

  function handleAddLibraryDialogChange(open: boolean) {
    setAddLibraryDialogOpen(open)
  }

  return (
    <>
      <section
        aria-label="Search and update community library inventories"
        className="border-y border-border"
      >
        <CommunityMap
          onUploadPhoto={handleUploadPhoto}
          onAddLibrary={handleAddLibrary}
          focusedLibrary={newlyAddedLibrary}
        />
      </section>

      {/* Update the inventory for an existing library */}
      <Dialog
        open={uploadDialogOpen}
        onOpenChange={handleUploadDialogChange}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Update Library Inventory</DialogTitle>

            <DialogDescription>
              Add current photos of the books on the shelf. AI will recognize
              the visible titles and update this library&apos;s inventory.
            </DialogDescription>
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

      {/* Create a library and its first inventory */}
      <Dialog
        open={addLibraryDialogOpen}
        onOpenChange={handleAddLibraryDialogChange}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add a New Library</DialogTitle>
          </DialogHeader>

          <AddLibraryForm onLibraryAdded={handleLibraryAdded} />
        </DialogContent>
      </Dialog>
    </>
  )
}
