import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore"

import { db } from "@/lib/firebase"
import type { Library } from "@/lib/libraries"

function convertLibrary(
  id: string,
  data: DocumentData,
): Library {
  return {
    id,
    name: data.name ?? "Unnamed library",
    neighborhood: data.neighborhood ?? "",
    address: data.address ?? "",
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    books: Array.isArray(data.books)
      ? data.books
      : [],
    bookCount:
      typeof data.bookCount === "number"
        ? data.bookCount
        : Array.isArray(data.books)
          ? data.books.length
          : 0,
    lastUpdated:
      typeof data.lastUpdated === "string"
        ? data.lastUpdated
        : data.lastUpdated?.toDate
          ? data.lastUpdated
              .toDate()
              .toLocaleString()
          : "Not yet updated",
    updatedBy:
      typeof data.updatedBy === "string" && data.updatedBy.trim()
        ? data.updatedBy.trim()
        : undefined,
    verified: data.verified ?? false,

    photoFile:
      typeof data.photoFile === "string"
      ? data.photoFile
      : undefined,
  }
}

export function subscribeToLibraries(
  onData: (libraries: Library[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(db, "libraries"),
    (snapshot: QuerySnapshot) => {
      const libraries = snapshot.docs.map((document) => {
        const data = document.data()

        return {
          id: document.id,
          name: data.name ?? "Unnamed library",
          neighborhood: data.neighborhood ?? "",
          address: data.address ?? "",
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          books: [],
          bookCount:
            typeof data.bookCount === "number"
              ? data.bookCount
              : Array.isArray(data.books)
                ? data.books.length
                : 0,
          lastUpdated:
            typeof data.lastUpdated === "string"
              ? data.lastUpdated
              : data.lastUpdated?.toDate
                ? data.lastUpdated.toDate().toLocaleString()
                : "Not yet updated",
          updatedBy:
            typeof data.updatedBy === "string" && data.updatedBy.trim()
              ? data.updatedBy.trim()
              : undefined,
          verified: data.verified ?? false,
          photoFile:
            typeof data.photoFile === "string"
              ? data.photoFile
              : undefined,
        } as Library
      })

      onData(libraries)
    },
    onError,
  )
}


export async function getLibraryWithBooks(
  library: Library,
): Promise<Library> {
  const inventorySnapshot = await getDoc(
    doc(db, "libraries", library.id, "inventory", "current"),
  )

  if (inventorySnapshot.exists()) {
    const inventoryData = inventorySnapshot.data()
    const books = Array.isArray(inventoryData.books)
      ? inventoryData.books
      : []

    return {
      ...library,
      books,
      bookCount:
        typeof inventoryData.bookCount === "number"
          ? inventoryData.bookCount
          : books.length,
    }
  }

  // Backward compatibility for older boxes that still keep books
  // directly on the library document.
  const legacySnapshot = await getDoc(
    doc(db, "libraries", library.id),
  )

  if (!legacySnapshot.exists()) {
    return library
  }

  return convertLibrary(
    legacySnapshot.id,
    legacySnapshot.data(),
  )
}
