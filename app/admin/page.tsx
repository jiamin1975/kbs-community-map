"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase";
import { rebuildBookSearchIndex } from "@/lib/rebuild-book-search-index";

type LibraryRow = {
  id: string;
  name: string;
  address: string;
  bookCount: number;
  photoFile: string | null;
};

type OrphanRow = {
  id: string;
  name: string | null;
  address: string | null;
  bookCount: number;
};

type RewardBook = {
  id: string;
  title: string;
  author: string;
  publisher: string;
  year: string;
  edition: string;
  status: "available" | "claimed";
};

export default function BookBoxAdminPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [approved, setApproved] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const [libraries, setLibraries] = useState<LibraryRow[]>([]);
  const [query, setQuery] = useState("");
  const [loadingLibraries, setLoadingLibraries] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [orphans, setOrphans] = useState<OrphanRow[]>([]);
  const [checkingOrphans, setCheckingOrphans] = useState(false);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);

  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");

  const [rewardPhotoUrl, setRewardPhotoUrl] = useState("");
  const [rewardPhotoUpdatedAt, setRewardPhotoUpdatedAt] = useState("");
  const [loadingRewardPhoto, setLoadingRewardPhoto] = useState(false);
  const [uploadingRewardPhoto, setUploadingRewardPhoto] = useState(false);
  const [recognizingRewardBooks, setRecognizingRewardBooks] = useState(false);
  const [savingRewardBooks, setSavingRewardBooks] = useState(false);
  const [rewardBooks, setRewardBooks] = useState<RewardBook[]>([]);

  async function normalizeRewardPhotoForRecognition(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          const maxDimension = 2400;
          const scale = Math.min(
            1,
            maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
          );

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Could not prepare the image for recognition."));
            return;
          }

          context.drawImage(image, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Could not prepare the image for recognition."));
                return;
              }

              resolve(
                new File([blob], "challenge-rewards.jpg", {
                  type: "image/jpeg",
                }),
              );
            },
            "image/jpeg",
            0.9,
          );
        };

        image.onerror = () =>
          reject(new Error("Could not read the selected image."));

        image.src = String(reader.result);
      };

      reader.onerror = () =>
        reject(new Error("Could not read the selected image."));

      reader.readAsDataURL(file);
    });
  }

  function normalizeRecognizedBooks(value: unknown): RewardBook[] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const book = item as Record<string, unknown>;

        const title =
          typeof book.title === "string" ? book.title.trim() : "";
        if (!title) return null;

        const author =
          typeof book.author === "string" ? book.author.trim() : "";
        const publisher =
          typeof book.publisher === "string" ? book.publisher.trim() : "";
        const year =
          typeof book.year === "string"
            ? book.year.trim()
            : typeof book.year === "number"
              ? String(book.year)
              : "";
        const edition =
          typeof book.edition === "string" ? book.edition.trim() : "";

        return {
          id: `${Date.now()}-${index}`,
          title,
          author,
          publisher,
          year,
          edition,
          status: "available" as const,
        };
      })
      .filter((book): book is RewardBook => book !== null);
  }

  async function recognizeRewardBooks(file: File) {
    setRecognizingRewardBooks(true);

    try {
      // The existing /api/analyze-books route expects multipart FormData
      // containing a real File under the "image" field.
      const normalizedFile = await normalizeRewardPhotoForRecognition(file);
      const formData = new FormData();
      formData.append("image", normalizedFile);

      const response = await fetch("/api/analyze-books", {
        method: "POST",
        body: formData,
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || "Book recognition failed.",
        );
      }

      const recognized = normalizeRecognizedBooks(result?.books);
      setRewardBooks(recognized);
      return recognized;
    } finally {
      setRecognizingRewardBooks(false);
    }
  }

  async function saveRewardBooks(books: RewardBook[] = rewardBooks) {
    setSavingRewardBooks(true);
    setMessage("");

    try {
      await setDoc(
        doc(db, "siteContent", "bookBoxChallenge"),
        {
          books: books.map(({ title, author, publisher, year, edition, status }) => ({
            title,
            author,
            publisher,
            year,
            edition,
            status,
          })),
          booksUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setMessage("Challenge study-book list saved.");
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? `Could not save study books: ${error.message}`
          : "Could not save study books.",
      );
    } finally {
      setSavingRewardBooks(false);
    }
  }

  async function loadRewardPhoto() {
    setLoadingRewardPhoto(true);
    try {
      const contentSnapshot = await getDoc(
        doc(db, "siteContent", "bookBoxChallenge"),
      );

      if (contentSnapshot.exists()) {
        const data = contentSnapshot.data();
        setRewardPhotoUrl(
          typeof data.rewardPhotoUrl === "string" ? data.rewardPhotoUrl : "",
        );

        const storedBooks = Array.isArray(data.books)
          ? data.books
              .map((item: unknown, index: number) => {
                if (!item || typeof item !== "object") return null;
                const book = item as Record<string, unknown>;
                const title =
                  typeof book.title === "string" ? book.title : "";
                if (!title.trim()) return null;

                return {
                  id: `stored-${index}`,
                  title,
                  author:
                    typeof book.author === "string" ? book.author : "",
                  publisher:
                    typeof book.publisher === "string" ? book.publisher : "",
                  year: typeof book.year === "string" ? book.year : "",
                  edition:
                    typeof book.edition === "string" ? book.edition : "",
                  status:
                    book.status === "claimed" ? "claimed" : "available",
                } satisfies RewardBook;
              })
              .filter((book: RewardBook | null): book is RewardBook => book !== null)
          : [];
        setRewardBooks(storedBooks);

        const updatedAt = data.rewardPhotoUpdatedAt;
        setRewardPhotoUpdatedAt(
          updatedAt?.toDate
            ? updatedAt.toDate().toLocaleString()
            : "",
        );
      } else {
        setRewardPhotoUrl("");
        setRewardPhotoUpdatedAt("");
        setRewardBooks([]);
      }
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? `Could not load challenge photo: ${error.message}`
          : "Could not load challenge photo.",
      );
    } finally {
      setLoadingRewardPhoto(false);
    }
  }

  async function handleRewardPhotoUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingRewardPhoto) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Please choose an image file.");
      return;
    }

    setUploadingRewardPhoto(true);
    setMessage("");

    try {
      const extension =
        file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "jpg";
      const photoFile = `available-books-${Date.now()}.${extension}`;
      const photoRef = ref(storage, `challenge-rewards/${photoFile}`);

      await uploadBytes(photoRef, file, {
        contentType: file.type || "image/jpeg",
      });
      const downloadUrl = await getDownloadURL(photoRef);

      const contentRef = doc(db, "siteContent", "bookBoxChallenge");
      const previousSnapshot = await getDoc(contentRef);
      const previousFile =
        previousSnapshot.exists() &&
        typeof previousSnapshot.data().rewardPhotoFile === "string"
          ? previousSnapshot.data().rewardPhotoFile
          : "";

      let recognizedBooks: RewardBook[] = [];
      try {
        recognizedBooks = await recognizeRewardBooks(file);
      } catch (recognitionError) {
        console.error(recognitionError);
      }

      await setDoc(
        contentRef,
        {
          rewardPhotoUrl: downloadUrl,
          rewardPhotoFile: photoFile,
          rewardPhotoUpdatedAt: serverTimestamp(),
          books: recognizedBooks.map(({ title, author, publisher, year, edition, status }) => ({
            title,
            author,
            publisher,
            year,
            edition,
            status,
          })),
          booksUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (previousFile && previousFile !== photoFile) {
        await deleteObject(
          ref(storage, `challenge-rewards/${previousFile}`),
        ).catch((error) => {
          if (error?.code !== "storage/object-not-found") {
            console.warn("Could not delete previous challenge photo:", error);
          }
        });
      }

      setRewardPhotoUrl(downloadUrl);
      setRewardPhotoUpdatedAt(new Date().toLocaleString());
      setMessage(
        recognizedBooks.length > 0
          ? `Challenge photo updated and ${recognizedBooks.length} book${recognizedBooks.length === 1 ? "" : "s"} recognized. Review the list below, then save any edits.`
          : "Challenge photo updated. No books were recognized automatically; you can add them below.",
      );
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? `Photo upload stopped: ${error.message}`
          : "Photo upload stopped because of an unexpected error.",
      );
    } finally {
      setUploadingRewardPhoto(false);
    }
  }

  async function loadLibraries() {
    setLoadingLibraries(true);
    try {
      const snapshot = await getDocs(collection(db, "libraries"));
      const rows = snapshot.docs.map((snapshotDoc) => {
        const data = snapshotDoc.data();
        return {
          id: snapshotDoc.id,
          name: String(data.name ?? "Unnamed book box"),
          address: String(data.address ?? ""),
          bookCount:
            typeof data.bookCount === "number"
              ? data.bookCount
              : Array.isArray(data.books)
                ? data.books.length
                : 0,
          photoFile:
            typeof data.photoFile === "string" && data.photoFile
              ? data.photoFile
              : null,
        };
      });
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setLibraries(rows);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? `Could not load book boxes: ${error.message}`
          : "Could not load book boxes.",
      );
    } finally {
      setLoadingLibraries(false);
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setAuthLoading(true);
      setUser(nextUser);
      setApproved(false);
      setAuthMessage("");

      if (!nextUser) {
        setAuthLoading(false);
        return;
      }

      try {
        const uidApproval = await getDoc(
          doc(db, "authorizedVolunteers", nextUser.uid),
        );

        let emailApproved = false;
        if (nextUser.email && nextUser.emailVerified) {
          const emailApproval = await getDoc(
            doc(db, "authorizedVolunteerEmails", nextUser.email),
          );
          emailApproved =
            emailApproval.exists() && emailApproval.data()?.active === true;
        }

        const uidApproved =
          uidApproval.exists() && uidApproval.data()?.active === true;

        if (uidApproved || emailApproved) {
          setApproved(true);
        } else {
          setAuthMessage(
            `Signed in as ${nextUser.email ?? "this account"}, but this account is not an approved volunteer.`,
          );
        }
      } catch (error) {
        console.error(error);
        setAuthMessage(
          error instanceof Error
            ? `Could not verify admin access: ${error.message}`
            : "Could not verify admin access.",
        );
      } finally {
        setAuthLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (approved) {
      void loadLibraries();
      void loadRewardPhoto();
    } else {
      setLibraries([]);
      setRewardPhotoUrl("");
      setRewardPhotoUpdatedAt("");
    }
  }, [approved]);

  async function handleGoogleSignIn() {
    setAuthMessage("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      setAuthMessage(
        error instanceof Error
          ? `Sign in failed: ${error.message}`
          : "Sign in failed.",
      );
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    setLibraries([]);
    setOrphans([]);
    setMessage("");
  }

  const filteredLibraries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return libraries;

    return libraries.filter((library) =>
      `${library.name} ${library.address} ${library.id}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [libraries, query]);

  async function deleteBookBox(library: LibraryRow) {
    if (deletingId) return;

    const confirmed = window.confirm(
      `Permanently delete "${library.name}"?\n\nThis will delete the book box, its Book List, its search index, and its exterior photo. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingId(library.id);
    setMessage("");

    try {
      // Delete child document before the parent document.
      await deleteDoc(
        doc(db, "libraries", library.id, "inventory", "current"),
      ).catch((error) => {
        // A missing child document is harmless; permission/network failures are not.
        if (error?.code !== "not-found") throw error;
      });

      await deleteDoc(doc(db, "bookSearch", library.id)).catch((error) => {
        if (error?.code !== "not-found") throw error;
      });

      if (library.photoFile) {
        await deleteObject(
          ref(storage, `library-photos/${library.photoFile}`),
        ).catch((error) => {
          if (error?.code !== "storage/object-not-found") throw error;
        });
      }

      await deleteDoc(doc(db, "libraries", library.id));

      setLibraries((current) =>
        current.filter((item) => item.id !== library.id),
      );
      setMessage(`Deleted "${library.name}" and its related records.`);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? `Delete stopped: ${error.message}`
          : "Delete stopped because of an unexpected error.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function findOrphans() {
    setCheckingOrphans(true);
    setMessage("");

    try {
      const [librarySnapshot, searchSnapshot] = await Promise.all([
        getDocs(collection(db, "libraries")),
        getDocs(collection(db, "bookSearch")),
      ]);

      const libraryIds = new Set(
        librarySnapshot.docs.map((snapshotDoc) => snapshotDoc.id),
      );

      const found = searchSnapshot.docs
        .filter((snapshotDoc) => !libraryIds.has(snapshotDoc.id))
        .map((snapshotDoc) => {
          const data = snapshotDoc.data();
          return {
            id: snapshotDoc.id,
            name:
              typeof data.name === "string" && data.name.trim()
                ? data.name
                : null,
            address:
              typeof data.address === "string" && data.address.trim()
                ? data.address
                : null,
            bookCount: Array.isArray(data.books) ? data.books.length : 0,
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id));

      setOrphans(found);
      setMessage(
        found.length === 0
          ? "No orphaned search records found."
          : `Found ${found.length} orphaned search record${found.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? `Orphan check stopped: ${error.message}`
          : "Orphan check stopped because of an unexpected error.",
      );
    } finally {
      setCheckingOrphans(false);
    }
  }

  async function cleanOrphans() {
    if (orphans.length === 0 || cleaningOrphans) return;

    const confirmed = window.confirm(
      `Delete ${orphans.length} orphaned bookSearch record${orphans.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;

    setCleaningOrphans(true);
    setMessage("");

    try {
      for (const orphan of orphans) {
        await deleteDoc(doc(db, "bookSearch", orphan.id));
      }
      const count = orphans.length;
      setOrphans([]);
      setMessage(
        `Deleted ${count} orphaned search record${count === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? `Cleanup stopped: ${error.message}`
          : "Cleanup stopped because of an unexpected error.",
      );
    } finally {
      setCleaningOrphans(false);
    }
  }

  async function handleRebuild() {
    if (running) return;

    const confirmed = window.confirm(
      "This will create/update the search index for all existing book boxes. It will not delete libraries or Book Lists. Continue?",
    );
    if (!confirmed) return;

    setRunning(true);
    setCompleted(0);
    setTotal(0);
    setMessage("");

    try {
      const result = await rebuildBookSearchIndex((done, all) => {
        setCompleted(done);
        setTotal(all);
      });

      setMessage(
        `Finished. ${result.librariesIndexed} book boxes were indexed successfully.`,
      );
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? `Indexing stopped: ${error.message}`
          : "Indexing stopped because of an unexpected error.",
      );
    } finally {
      setRunning(false);
    }
  }

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (authLoading) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12 sm:px-6">
        <h1 className="text-2xl font-bold">Book Box Admin</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Checking admin access…
        </p>
      </main>
    );
  }

  if (!user || !approved) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12 sm:px-6">
        <h1 className="text-2xl font-bold">Book Box Admin</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in with an approved Google account to manage book boxes.
        </p>

        {authMessage && (
          <div className="mt-5 rounded-lg border border-border p-4 text-sm">
            {authMessage}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            className="rounded-none bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
          >
            Sign in with Google
          </button>

          {user && (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-none border border-border px-5 py-3 text-sm font-semibold"
            >
              Sign out
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">Book Box Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage book boxes and maintain the fast Book List search index.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-border p-3">
        <p className="text-sm">
          Signed in as <span className="font-semibold">{user.email}</span>
        </p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="rounded-none border border-border px-3 py-2 text-sm font-semibold"
        >
          Sign out
        </button>
      </div>

      {message && (
        <div className="mt-6 rounded-lg border border-border p-4 text-sm">
          {message}
        </div>
      )}

      <section className="mt-8 border border-border p-5">
        <h2 className="text-lg font-bold">Challenge Reward Books</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the current reward-book photo. AI will recognize the books,
          then you can correct the list and mark each book Available or Claimed.
        </p>

        <div className="mt-4 border border-border bg-muted/20 p-3">
          {loadingRewardPhoto ? (
            <p className="text-sm text-muted-foreground">
              Loading current photo…
            </p>
          ) : rewardPhotoUrl ? (
            <img
              src={rewardPhotoUrl}
              alt="Current available Book Box Challenge study books"
              className="max-h-[420px] w-full object-contain"
            />
          ) : (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              No reward book photo uploaded yet.
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-none bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            {uploadingRewardPhoto
              ? "Uploading…"
              : rewardPhotoUrl
                ? "Replace Photo"
                : "Upload Photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadingRewardPhoto}
              onChange={(event) => void handleRewardPhotoUpload(event)}
              className="hidden"
            />
          </label>

          {(uploadingRewardPhoto || recognizingRewardBooks) && (
            <p className="text-sm text-muted-foreground">
              {recognizingRewardBooks
                ? "AI is recognizing books…"
                : "Uploading photo…"}
            </p>
          )}

          {rewardPhotoUpdatedAt && (
            <p className="text-xs text-muted-foreground">
              Last updated: {rewardPhotoUpdatedAt}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">Recognized Books</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Edit recognition mistakes or change a book's status after it is claimed.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setRewardBooks((current) => [
                  ...current,
                  {
                    id: `manual-${Date.now()}`,
                    title: "",
                    author: "",
                    publisher: "",
                    year: "",
                    edition: "",
                    status: "available",
                  },
                ])
              }
              className="rounded-none border border-border px-3 py-2 text-sm font-semibold"
            >
              + Add Book
            </button>
          </div>

          {rewardBooks.length === 0 ? (
            <p className="mt-4 border border-border p-4 text-sm text-muted-foreground">
              No books in the list yet. Upload a photo for AI recognition or add
              a book manually.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {rewardBooks.map((book, index) => (
                <div key={book.id} className="border border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={book.title}
                      onChange={(event) =>
                        setRewardBooks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Book title"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
                    />
                    <input
                      value={book.author}
                      onChange={(event) =>
                        setRewardBooks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, author: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Author"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={book.publisher}
                      onChange={(event) =>
                        setRewardBooks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, publisher: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Publisher / prep brand"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={book.year}
                      onChange={(event) =>
                        setRewardBooks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, year: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Year"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={book.edition}
                      onChange={(event) =>
                        setRewardBooks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, edition: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Edition"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setRewardBooks((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, status: "available" }
                                : item,
                            ),
                          )
                        }
                        className={`rounded-none border px-3 py-1.5 text-xs font-semibold ${
                          book.status === "available"
                            ? "border-green-600 bg-green-600 text-white"
                            : "border-border"
                        }`}
                      >
                        Available
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRewardBooks((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, status: "claimed" }
                                : item,
                            ),
                          )
                        }
                        className={`rounded-none border px-3 py-1.5 text-xs font-semibold ${
                          book.status === "claimed"
                            ? "border-gray-600 bg-gray-600 text-white"
                            : "border-border"
                        }`}
                      >
                        Claimed
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setRewardBooks((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      className="text-xs font-semibold text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => void saveRewardBooks()}
            disabled={savingRewardBooks || recognizingRewardBooks}
            className="mt-4 rounded-none bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {savingRewardBooks ? "Saving…" : "Save Book List"}
          </button>
        </div>
      </section>

      <section className="mt-6 border border-border p-5">
        <h2 className="text-lg font-bold">Book Boxes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search by box name, address, or document ID.
        </p>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search book boxes…"
          className="mt-4 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none"
        />

        <div className="mt-4 max-h-[420px] overflow-y-auto border border-border">
          {loadingLibraries ? (
            <p className="p-4 text-sm text-muted-foreground">
              Loading book boxes…
            </p>
          ) : filteredLibraries.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No matching book boxes.
            </p>
          ) : (
            filteredLibraries.map((library) => (
              <div
                key={library.id}
                className="flex items-start justify-between gap-4 border-b border-border p-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{library.name}</p>
                  {library.address && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {library.address}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {library.bookCount} book
                    {library.bookCount === 1 ? "" : "s"} · {library.id}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void deleteBookBox(library)}
                  disabled={deletingId !== null}
                  className="shrink-0 rounded-none border border-red-600 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"
                >
                  {deletingId === library.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-6 border border-border p-5">
        <h2 className="text-lg font-bold">Orphaned Search Records</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Find search records left behind after a book box was manually deleted
          from Firebase.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void findOrphans()}
            disabled={checkingOrphans || cleaningOrphans}
            className="rounded-none bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {checkingOrphans ? "Checking…" : "Find Orphaned Records"}
          </button>

          {orphans.length > 0 && (
            <button
              type="button"
              onClick={() => void cleanOrphans()}
              disabled={cleaningOrphans}
              className="rounded-none border border-red-600 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"
            >
              {cleaningOrphans
                ? "Deleting…"
                : `Delete ${orphans.length} Orphaned Record${orphans.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>

        {orphans.length > 0 && (
          <div className="mt-4 border border-border">
            {orphans.map((orphan) => (
              <div
                key={orphan.id}
                className="border-b border-border p-3 text-sm last:border-b-0"
              >
                {orphan.name ? (
                  <>
                    <p className="font-semibold">{orphan.name}</p>
                    {orphan.address && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {orphan.address}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {orphan.bookCount} book
                      {orphan.bookCount === 1 ? "" : "s"} · {orphan.id}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">{orphan.id}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {orphan.bookCount} book
                      {orphan.bookCount === 1 ? "" : "s"} · address unavailable
                      (box was deleted before details were stored in the search index)
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 border border-border p-5">
        <h2 className="text-lg font-bold">Search Index Maintenance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rebuild all existing search records only when you intentionally need
          to regenerate the index.
        </p>

        <button
          type="button"
          onClick={() => void handleRebuild()}
          disabled={running}
          className="mt-4 rounded-none bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {running ? "Indexing…" : "Rebuild Search Index"}
        </button>

        {(running || total > 0) && (
          <div className="mt-5">
            <p className="text-sm font-medium">
              {completed} / {total || "…"} boxes indexed
            </p>
            <div className="mt-2 h-3 overflow-hidden bg-gray-200">
              <div
                className="h-full bg-blue-600 transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
