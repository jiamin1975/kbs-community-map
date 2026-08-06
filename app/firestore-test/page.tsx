"use client"

import { useEffect, useState } from "react"
import { collection, getDocs } from "firebase/firestore"

import { db } from "@/lib/firebase"

type FirestoreLibrary = {
  id: string
  name: string
  address: string
}

export default function FirestoreTestPage() {
  const [libraries, setLibraries] =
    useState<FirestoreLibrary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadLibraries() {
      try {
        const snapshot = await getDocs(
          collection(db, "libraries"),
        )

        const results = snapshot.docs.map((document) => {
          const data = document.data()

          return {
            id: document.id,
            name: data.name ?? "Unnamed library",
            address: data.address ?? "",
          }
        })

        setLibraries(results)
      } catch (caughtError) {
        console.error(caughtError)

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load Firestore data.",
        )
      } finally {
        setLoading(false)
      }
    }

    loadLibraries()
  }, [])

  if (loading) {
    return <main className="p-8">Loading Firestore…</main>
  }

  if (error) {
    return (
      <main className="p-8 text-red-600">
        {error}
      </main>
    )
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">
        Firestore Connection Test
      </h1>

      <div className="mt-6 space-y-4">
        {libraries.map((library) => (
          <article
            key={library.id}
            className="rounded-xl border p-4"
          >
            <h2 className="font-semibold">
              {library.name}
            </h2>
            <p>{library.address}</p>
          </article>
        ))}
      </div>
    </main>
  )
}