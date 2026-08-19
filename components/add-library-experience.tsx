"use client"

import { useState } from "react"

import { AddLibraryForm } from "@/components/add-library-form"
import { BookPhotoTester } from "@/components/book-photo-tester"
import type { Library } from "@/lib/libraries"

export function AddLibraryExperience() {
  const [newLibrary, setNewLibrary] =
    useState<Library | null>(null)

  function handleLibraryAdded(library: Library) {
    setNewLibrary(library)

    window.setTimeout(() => {
      document
        .getElementById("first-inventory")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
    }, 100)
  }

  return (
    <>
      <AddLibraryForm
        onLibraryAdded={handleLibraryAdded}
      />

      {newLibrary && (
        <section
          id="first-inventory"
          className="mx-auto max-w-3xl px-4 pb-12 sm:px-6"
        >
          <div className="mb-5 rounded-xl border border-green-300 bg-green-50 p-4 text-green-900">
            <p className="font-semibold">
              Book Box added successfully
            </p>

            <p className="mt-1 text-sm">
              Upload its first shelf photo to
              create the initial inventory.
            </p>
          </div>

          <BookPhotoTester
            key={newLibrary.id}
            library={newLibrary}
          />
        </section>
      )}
    </>
  )
}