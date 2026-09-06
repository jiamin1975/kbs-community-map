import OpenAI from "openai"
import { zodTextFormat } from "openai/helpers/zod"
import { NextResponse } from "next/server"
import { z } from "zod"

export const runtime = "nodejs"

const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const MAX_RECOGNITION_ATTEMPTS = 2

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

const BookRecognitionSchema = z.object({
  books: z.array(
    z.object({
      title: z.string(),
      author: z.string().nullable(),
      confidence: z.enum(["high", "medium", "low"]),
      visibleText: z.string().nullable(),
    }),
  ),
  notes: z.string(),
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function recognizeBooks(imageDataUrl: string) {
  return openai.responses.parse({
    model: "gpt-5.6-luna",
    input: [
      {
        role: "system",
        content:
          "You identify visible books in photographs. Be conservative and never invent a title.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Analyze this image of a bookshelf or Little Free Library.

Identify every book whose title is sufficiently visible.

Rules:
- Do not guess a title from color, layout, or vague resemblance alone.
- Include partially visible books only when enough text is present.
- Use confidence "high" when the full title is clearly readable.
- Use confidence "medium" when most of the title is readable.
- Use confidence "low" when the title is incomplete but still reasonably identifiable.
- If an author is not visible, return null.
- In visibleText, record the actual title or spine text you relied on.
- Ignore magazines, toys, decorations, and other non-book objects.
- Mention glare, blur, obstruction, or unreadable books in notes.
            `.trim(),
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: "high",
          },
        ],
      },
    ],
    text: {
      format: zodTextFormat(
        BookRecognitionSchema,
        "book_recognition",
      ),
    },
  })
}

function isRetryableRecognitionError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    return (
      error.status === 408 ||
      error.status === 409 ||
      error.status === 429 ||
      (typeof error.status === "number" && error.status >= 500)
    )
  }

  // This also covers intermittent SDK / structured-output parsing errors,
  // including messages such as "The string did not match the expected pattern."
  return error instanceof Error
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY is missing. Add it to .env.local and restart the server.",
        },
        { status: 500 },
      )
    }

    const formData = await request.formData()
    const image = formData.get("image")

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "No image was uploaded." },
        { status: 400 },
      )
    }

    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      return NextResponse.json(
        {
          error: "Only JPG, PNG, and WebP images are supported.",
        },
        { status: 400 },
      )
    }

    if (image.size === 0) {
      return NextResponse.json(
        { error: "The uploaded image is empty." },
        { status: 400 },
      )
    }

    if (image.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        {
          error: "The image must be smaller than 10 MB.",
        },
        { status: 400 },
      )
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer())
    const base64Image = imageBuffer.toString("base64")
    const imageDataUrl = `data:${image.type};base64,${base64Image}`

    let lastError: unknown = null

    for (let attempt = 1; attempt <= MAX_RECOGNITION_ATTEMPTS; attempt += 1) {
      try {
        const response = await recognizeBooks(imageDataUrl)

        if (!response.output_parsed) {
          throw new Error(
            "The model did not return a usable recognition result.",
          )
        }

        return NextResponse.json(response.output_parsed)
      } catch (error) {
        lastError = error
        console.error(
          `Book recognition attempt ${attempt} failed:`,
          error,
        )

        if (
          attempt === MAX_RECOGNITION_ATTEMPTS ||
          !isRetryableRecognitionError(error)
        ) {
          break
        }
      }
    }

    if (lastError instanceof OpenAI.APIError) {
      return NextResponse.json(
        {
          error:
            "We couldn't recognize books in this photo. Please try the photo again.",
          status: lastError.status,
          code: lastError.code,
        },
        { status: lastError.status ?? 502 },
      )
    }

    return NextResponse.json(
      {
        error:
          "We couldn't recognize books in this photo. Please try the photo again.",
      },
      { status: 502 },
    )
  } catch (error) {
    console.error("Book recognition request failed:", error)

    return NextResponse.json(
      {
        error:
          "We couldn't process this photo. Please try the photo again.",
      },
      { status: 500 },
    )
  }
}
