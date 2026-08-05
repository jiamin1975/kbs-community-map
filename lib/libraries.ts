export type Library = {
  id: string
  name: string
  neighborhood: string
  books: string[]
  bookCount: number
  lastUpdated: string
  /** Marker position as a percentage of the map area (0–100). */
  latitude: number
  longitude: number
}

export const libraries: Library[] = [
  {
    id: "temp-001",
    name: "Little Free Library (Temporary)",
    neighborhood: "Bethesda",
    address: "Replace with verified address",
    latitude: 38.9847,
    longitude: -77.0947,
    books: [],
    bookCount: 0,
    lastUpdated: "Not yet inventoried",
  },
  {
    id: "temp-002",
    name: "Little Free Library (Temporary)",
    neighborhood: "Rockville",
    address: "Replace with verified address",
    latitude: 39.0840,
    longitude: -77.1528,
    books: [],
    bookCount: 0,
    lastUpdated: "Not yet inventoried",
  },
  {
    id: "temp-003",
    name: "Little Free Library (Temporary)",
    neighborhood: "Potomac",
    address: "Replace with verified address",
    latitude: 39.0182,
    longitude: -77.2086,
    books: [],
    bookCount: 0,
    lastUpdated: "Not yet inventoried",
  },
]