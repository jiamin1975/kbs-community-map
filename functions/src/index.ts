import {initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {setGlobalOptions} from "firebase-functions";
import {defineSecret} from "firebase-functions/params";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as nodemailer from "nodemailer";

setGlobalOptions({maxInstances: 10});

initializeApp();

const firestore = getFirestore();
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
const notificationEmail = "kitsbeyondsound@gmail.com";

type BookBoxData = Record<string, unknown>;
type NotificationAction = "added" | "updated";

/**
 * Returns a trimmed string or a fallback value.
 * @param {unknown} value Value to convert to readable text.
 * @param {string} fallback Text used when the value is empty.
 * @return {string} A non-empty display string.
 */
function readableText(value: unknown, fallback = "Not provided") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * Escapes user-provided text before placing it in the HTML email.
 * @param {string} value Text that may contain HTML characters.
 * @return {string} HTML-safe text.
 */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Returns the stored book count or counts the books array.
 * @param {BookBoxData} data Firestore data for the book box.
 * @return {number} The number of books in the box.
 */
function getBookCount(data: BookBoxData) {
  if (typeof data.bookCount === "number") {
    return data.bookCount;
  }

  return Array.isArray(data.books) ? data.books.length : 0;
}

/**
 * Claims an event so Firebase retries do not send duplicate emails.
 * @param {string} eventId Unique Firebase event identifier.
 */
async function claimNotification(eventId: string) {
  const notificationReference = firestore
    .collection("emailNotificationEvents")
    .doc(eventId);

  try {
    await notificationReference.create({
      status: "sending",
      createdAt: FieldValue.serverTimestamp(),
    });

    return notificationReference;
  } catch (caughtError) {
    const code = (caughtError as {code?: string | number}).code;

    if (code === 6 || code === "already-exists") {
      logger.info("Skipping a duplicate email notification event.", {eventId});
      return null;
    }

    throw caughtError;
  }
}

/**
 * Sends one book-box activity notification email.
 * @param {string} eventId Unique Firebase event identifier.
 * @param {NotificationAction} action Whether the box was added or updated.
 * @param {string} libraryId Firestore document identifier for the box.
 * @param {BookBoxData} data Current Firestore data for the book box.
 */
async function sendBookBoxNotification(
  eventId: string,
  action: NotificationAction,
  libraryId: string,
  data: BookBoxData,
) {
  const notificationReference = await claimNotification(eventId);

  if (!notificationReference) return;

  const actionLabel = action === "added" ? "Added" : "Updated";
  const boxName = readableText(data.name, "Unnamed Book Box");
  const address = readableText(data.address);
  const neighborhood = readableText(data.neighborhood);
  const volunteer = readableText(
    data.updatedBy ?? data.createdBy,
    "Not provided",
  );
  const bookCount = getBookCount(data);
  const eventTime = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subject = `Book Box ${actionLabel}: ${boxName}`;
  const mapUrl =
    `https://map.kitsbeyondsound.com/?box=${encodeURIComponent(libraryId)}`;
  const plainText = [
    `A book box was ${action}.`,
    `Book box: ${boxName}`,
    `Address: ${address}`,
    `Neighborhood: ${neighborhood}`,
    `Books: ${bookCount}`,
    `Volunteer: ${volunteer}`,
    `Time: ${eventTime}`,
    `Document ID: ${libraryId}`,
    `Map: ${mapUrl}`,
  ].join("\n");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: notificationEmail,
      pass: gmailAppPassword.value(),
    },
  });

  try {
    await transporter.sendMail({
      from: `KBS Book Box Map <${notificationEmail}>`,
      to: notificationEmail,
      subject,
      text: plainText,
      html: `
        <h2>Book Box ${actionLabel}</h2>
        <p>A book box was ${action}.</p>
        <table style="border-collapse:collapse">
          <tr>
            <td><strong>Book box:</strong></td>
            <td>${escapeHtml(boxName)}</td>
          </tr>
          <tr>
            <td><strong>Address:</strong></td>
            <td>${escapeHtml(address)}</td>
          </tr>
          <tr>
            <td><strong>Neighborhood:</strong></td>
            <td>${escapeHtml(neighborhood)}</td>
          </tr>
          <tr><td><strong>Books:</strong></td><td>${bookCount}</td></tr>
          <tr>
            <td><strong>Volunteer:</strong></td>
            <td>${escapeHtml(volunteer)}</td>
          </tr>
          <tr>
            <td><strong>Time:</strong></td>
            <td>${escapeHtml(eventTime)}</td>
          </tr>
          <tr>
            <td><strong>Document ID:</strong></td>
            <td>${escapeHtml(libraryId)}</td>
          </tr>
        </table>
        <p>
          <a href="${escapeHtml(mapUrl)}">
            Open This Book Box on the Map
          </a>
        </p>
      `,
    });

    await notificationReference.update({
      status: "sent",
      sentAt: FieldValue.serverTimestamp(),
      action,
      libraryId,
    });

    logger.info("Book box email notification sent.", {action, libraryId});
  } catch (caughtError) {
    await notificationReference.delete().catch(() => undefined);
    logger.error("Could not send the book box email notification.", {
      action,
      libraryId,
      error: caughtError,
    });
    throw caughtError;
  }
}

export const notifyBookBoxAdded = onDocumentCreated(
  {
    document: "libraries/{libraryId}",
    secrets: [gmailAppPassword],
    maxInstances: 3,
  },
  async (event) => {
    const data = event.data?.data();

    if (!data) return;

    await sendBookBoxNotification(
      event.id,
      "added",
      event.params.libraryId,
      data,
    );
  },
);

export const notifyBookBoxUpdated = onDocumentUpdated(
  {
    document: "libraries/{libraryId}",
    secrets: [gmailAppPassword],
    maxInstances: 3,
  },
  async (event) => {
    const data = event.data?.after.data();

    if (!data) return;

    await sendBookBoxNotification(
      event.id,
      "updated",
      event.params.libraryId,
      data,
    );
  },
);
