import {
  collection,
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
    verified: data.verified ?? false,
  }
}

export function subscribeToLibraries(
  onData: (libraries: Library[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(db, "libraries"),
    (snapshot: QuerySnapshot) => {
      const libraries = snapshot.docs.map(
        (document) =>
          convertLibrary(
            document.id,
            document.data(),
          ),
      )

      onData(libraries)
    },
    onError,
  )
}