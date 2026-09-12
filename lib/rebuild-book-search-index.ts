"use client";

import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getLibraryWithBooks } from "@/lib/firestore-libraries";
import type { Library } from "@/lib/libraries";

function words(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function tokens(books: any[]) {
  return [...new Set(books.flatMap((book) => {
    const title = typeof book === "string" ? book : String(book?.title ?? "");
    const author = typeof book === "object" && book?.author ? String(book.author) : "";
    return words(`${title} ${author}`);
  }))];
}

export async function rebuildBookSearchIndex(
  onProgress?: (completed: number, total: number) => void,
) {
  const snapshot = await getDocs(collection(db, "libraries"));
  const libraries = snapshot.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      name: x.name ?? "Unnamed library",
      neighborhood: x.neighborhood ?? "",
      address: x.address ?? "",
      latitude: Number(x.latitude),
      longitude: Number(x.longitude),
      books: Array.isArray(x.books) ? x.books : [],
      bookCount: typeof x.bookCount === "number" ? x.bookCount : 0,
      lastUpdated: x.lastUpdated ?? "",
      updatedBy: x.updatedBy ?? null,
      photoFile: x.photoFile ?? null,
    } as Library;
  });

  let completed = 0;
  for (const library of libraries) {
    const full = await getLibraryWithBooks(library);
    await setDoc(doc(db, "bookSearch", library.id), {
      libraryId: library.id,
      books: full.books,
      searchTokens: tokens(full.books),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    completed++;
    onProgress?.(completed, libraries.length);
  }
  return { librariesIndexed: completed };
}
