export type Library = {
  id: string
  name: string
  neighborhood: string
  books: string[]
  bookCount: number
  lastUpdated: string
  /** Marker position as a percentage of the map area (0–100). */
  position: { top: number; left: number }
}

export const libraries: Library[] = [
  {
    id: 'maplewood',
    name: 'Maplewood Little Library',
    neighborhood: 'Maplewood Park',
    bookCount: 42,
    books: ['Bridge to Terabithia', 'The Snowy Day', 'Last Stop on Market Street', 'Wonder'],
    lastUpdated: '2 hours ago',
    position: { top: 32, left: 22 },
  },
  {
    id: 'riverside',
    name: 'Riverside Reading Box',
    neighborhood: 'Riverside Commons',
    bookCount: 28,
    books: ['Charlotte\u2019s Web', 'The Giver', 'Hair Love', 'Frog and Toad Are Friends'],
    lastUpdated: 'Yesterday',
    position: { top: 58, left: 40 },
  },
  {
    id: 'hillcrest',
    name: 'Hillcrest Book Nook',
    neighborhood: 'Hillcrest Elementary',
    bookCount: 63,
    books: ['Matilda', 'Because of Winn-Dixie', 'The One and Only Ivan', 'Esperanza Rising'],
    lastUpdated: '4 days ago',
    position: { top: 24, left: 62 },
  },
  {
    id: 'harborview',
    name: 'Harborview Story Stop',
    neighborhood: 'Harborview Docks',
    bookCount: 19,
    books: ['Are You My Mother?', 'The Very Hungry Caterpillar', 'Corduroy'],
    lastUpdated: '1 week ago',
    position: { top: 70, left: 74 },
  },
  {
    id: 'oakdale',
    name: 'Oakdale Community Shelf',
    neighborhood: 'Oakdale Rec Center',
    bookCount: 51,
    books: ['Holes', 'Number the Stars', 'Front Desk', 'The Watsons Go to Birmingham'],
    lastUpdated: '3 hours ago',
    position: { top: 44, left: 84 },
  },
]
