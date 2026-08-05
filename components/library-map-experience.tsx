"use client"

import { useState } from "react"

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

  const [dialogOpen, setDialogOpen] =
    useState(false)

  function handleUploadPhoto(library: Library) {
    setSelectedLibrary(library)
    setDialogOpen(true)
  }

  function handleDialogChange(open: boolean) {
    setDialogOpen(open)

    if (!open) {
      setSelectedLibrary(null)
    }
  }

  return (
    <>
      <section
        aria-label="Interactive library map"
        className="border-y border-border"
      >
        <CommunityMap
          onUploadPhoto={handleUploadPhoto}
        />
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
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
              onFinished={() => setDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}