"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
} from "firebase/firestore";
import {
  deleteObject,
  ref,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
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

export default function BookBoxAdminPage() {
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
    void loadLibraries();
  }, []);

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

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">Book Box Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage book boxes and maintain the fast Book List search index.
      </p>

      {message && (
        <div className="mt-6 rounded-lg border border-border p-4 text-sm">
          {message}
        </div>
      )}

      <section className="mt-8 border border-border p-5">
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
