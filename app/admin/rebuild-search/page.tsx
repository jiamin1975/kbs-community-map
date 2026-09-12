"use client";

import { useState } from "react";
import { rebuildBookSearchIndex } from "@/lib/rebuild-book-search-index";

export default function RebuildSearchPage() {
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");

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

  const percent =
    total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-bold">Rebuild Book Search Index</h1>

      <p className="mt-3 text-sm text-muted-foreground">
        Run this once to make existing book boxes available in the new fast
        search. This does not delete or change existing Book Lists.
      </p>

      <button
        type="button"
        onClick={handleRebuild}
        disabled={running}
        className="mt-6 rounded-none bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
      >
        {running ? "Indexing…" : "Rebuild Search Index"}
      </button>

      {(running || total > 0) && (
        <div className="mt-6">
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

      {message && (
        <p className="mt-6 rounded-lg border border-border p-4 text-sm">
          {message}
        </p>
      )}
    </main>
  );
}
