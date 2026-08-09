import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// This app also uses AWS SES for email (see mailer.js), which reads the
// plain AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION env vars via
// the SDK's default credential chain. Your Render environment additionally
// defines "_s3"-suffixed versions of the same four settings — dedicated
// credentials/region/bucket meant specifically for S3. The AWS SDK does NOT
// auto-detect custom-named env vars like AWS_ACCESS_KEY_ID_s3 on its own,
// so without reading them explicitly here, S3 silently falls back to
// whatever is under the plain names (which may lack S3 permissions, or
// point at the wrong bucket/region) — this is what was producing the
// "UnknownError" you saw in the logs. Preferring the "_s3" variants when
// present fixes that, while leaving mailer.js/SES completely untouched.
const region =
  process.env.AWS_REGION_s3 ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "ap-south-1";
const bucket =
  process.env.AWS_S3_BUCKET_s3 ||
  process.env.AWS_S3_BUCKET ||
  process.env.S3_BUCKET;
const publicBaseUrl =
  process.env.AWS_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL;
const endpoint = process.env.AWS_S3_ENDPOINT || undefined;

const accessKeyId =
  process.env.AWS_ACCESS_KEY_ID_s3 || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey =
  process.env.AWS_SECRET_ACCESS_KEY_s3 || process.env.AWS_SECRET_ACCESS_KEY;
const credentials =
  accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;

let client;
function getClient() {
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is not configured.");
  }
  if (!client) client = new S3Client({ region, endpoint, credentials });
  return client;
}

// Surfaces the ACTUAL reason an S3 call failed. The generic "UnknownError"
// you see from the AWS SDK hides the real cause (wrong bucket, wrong
// region, invalid/expired credentials, missing permission, object genuinely
// missing, etc). This pulls whatever extra detail the SDK does carry —
// HTTP status code, AWS error code, request id — into one readable line,
// plus which credential source is configured (never logs the actual key).
function logS3Error(action, key, err) {
  const meta = err && err.$metadata;
  console.warn(
    `[s3Storage] ${action}("${key}") failed:`,
    JSON.stringify({
      name: err?.name,
      code: err?.Code || err?.code,
      message: err?.message,
      httpStatusCode: meta?.httpStatusCode,
      requestId: meta?.requestId,
      bucket,
      region,
      usingCredentialSource: process.env.AWS_ACCESS_KEY_ID_s3
        ? "AWS_ACCESS_KEY_ID_s3"
        : process.env.AWS_ACCESS_KEY_ID
          ? "AWS_ACCESS_KEY_ID"
          : "none (no static credentials found — SDK default chain)",
    }),
  );
}

function parseDataUri(dataUri) {
  if (!dataUri || typeof dataUri !== "string" || !dataUri.startsWith("data:"))
    return null;
  const match = dataUri.match(/^data:([^;,]+)(;[^,]*)?,(.+)$/);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const isBase64 = /;base64/.test(match[2] || "");
  const payload = match[3];
  return {
    contentType,
    buffer: isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8"),
  };
}

function extFromMime(contentType) {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[contentType] || "bin";
}

export async function storeDataUriOnS3(dataUri, filenameHint = "file") {
  const parsed = parseDataUri(dataUri);
  if (!parsed) return dataUri;
  const s3 = getClient();
  if (!s3) return null;

  const safeHint =
    String(filenameHint)
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "file";
  const key = `uploads/${new Date().toISOString().slice(0, 10)}/${safeHint}-${randomUUID()}.${extFromMime(parsed.contentType)}`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: parsed.buffer,
        ContentType: parsed.contentType,
      }),
    );
  } catch (err) {
    logS3Error("storeDataUriOnS3 (PutObject)", key, err);
    throw err; // upload failures must stay loud — the caller needs to know the photo wasn't saved
  }

  // If a public CDN/base URL is configured, use it — the object is publicly
  // readable so no signing is needed.
  if (publicBaseUrl) return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;

  // No public URL — generate a pre-signed GET URL so the browser can fetch
  // the image directly from S3 without going through the Express proxy route
  // (which requires HeadObject + GetObject permissions and was returning 403).
  // Pre-signed URLs are signed with the same upload credentials, so they work
  // as long as PutObject works. Fall back to the proxy path only if signing
  // itself somehow fails.
  const presigned = await getS3PresignedUrl(key);
  if (presigned) return presigned;

  // Last-resort fallback: proxy path (requires GetObject on the server side).
  return `/api/files/s3/${encodeURIComponent(key)}`;
}

export function parseS3FileUrl(fileUrl) {
  const prefix = "/api/files/s3/";
  if (!fileUrl || typeof fileUrl !== "string" || !fileUrl.startsWith(prefix))
    return null;
  return decodeURIComponent(fileUrl.slice(prefix.length));
}

// How long a pre-signed GET URL stays valid. 7 days is the AWS maximum for
// credentials-based signing; we use 6 days so there's always a comfortable
// margin before expiry. Avatars are re-signed on every profile/dashboard load
// (see refreshS3AvatarUrl) so users who open the app daily never see a broken
// image.
const PRESIGN_TTL_SECONDS = 6 * 24 * 60 * 60; // 6 days

/**
 * Generate a pre-signed GET URL for an S3 object key.
 * The URL is valid for PRESIGN_TTL_SECONDS and works directly in <img src>
 * without any server proxy round-trip — this is how avatars are served now.
 *
 * Returns null if the client or key is not available.
 */
export async function getS3PresignedUrl(key) {
  if (!key) return null;
  const s3 = getClient();
  if (!s3) return null;
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(s3, cmd, { expiresIn: PRESIGN_TTL_SECONDS });
  } catch (err) {
    logS3Error("getS3PresignedUrl (GetObject presign)", key, err);
    return null;
  }
}

export async function getS3FileMeta(key) {
  const s3 = getClient();
  if (!s3 || !key) return null;
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    // Any S3-side failure (missing object, wrong region/credentials, a
    // permissions issue, or the AWS SDK's own error-body parsing failing
    // on an unexpected response) should behave like "file not found" to
    // the caller — never let it crash the request. files.routes.js already
    // turns a null return into a clean 404.
    logS3Error("getS3FileMeta (HeadObject)", key, err);
    return null;
  }
}

export async function openS3DownloadStream(key) {
  const s3 = getClient();
  if (!s3 || !key) return null;
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (result.Body instanceof Readable) return result.Body;
    return Readable.fromWeb(result.Body);
  } catch (err) {
    logS3Error("openS3DownloadStream (GetObject)", key, err);
    return null;
  }
}

/**
 * Extract the S3 key from whatever format the avatar was stored as:
 *   - "/api/files/s3/uploads%2F..."  → proxy path  → decode key
 *   - "https://...s3.amazonaws.com/KEY?X-Amz-..." → presigned URL → extract key
 *   - Anything else (GridFS id path, plain https public URL) → return null
 *
 * Returns the raw S3 key string, or null if this URL isn't an S3-managed one.
 */
export function extractS3Key(url) {
  if (!url || typeof url !== "string") return null;

  // Proxy path stored by old code
  const proxyKey = parseS3FileUrl(url);
  if (proxyKey) return proxyKey;

  // Pre-signed URL — extract the path portion before the query string
  // e.g. https://bucket.s3.ap-south-1.amazonaws.com/uploads/2026-08-09/student-xxx.jpg?X-Amz-...
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.includes("amazonaws.com") &&
      parsed.searchParams.has("X-Amz-Signature")
    ) {
      // pathname starts with "/" so strip it
      return decodeURIComponent(parsed.pathname.slice(1));
    }
  } catch (_) {
    // not a valid URL, ignore
  }

  return null;
}

/**
 * Given a stored avatar URL, return a fresh pre-signed URL if the value is
 * an S3-managed object, or return the original URL unchanged (GridFS paths,
 * public CDN URLs, data URIs all pass through untouched).
 *
 * Call this whenever you're about to send an avatar URL to the client so
 * the browser always gets a URL that won't 403/404.
 */
export async function refreshS3Url(storedUrl) {
  if (!storedUrl) return storedUrl;
  if (publicBaseUrl) return storedUrl; // public bucket — no signing needed

  const key = extractS3Key(storedUrl);
  if (!key) return storedUrl; // GridFS or data URI — leave as-is

  const fresh = await getS3PresignedUrl(key);
  return fresh || storedUrl; // if signing fails, return what we have
}

export async function deleteS3File(fileUrl) {
  const key = parseS3FileUrl(fileUrl);
  const s3 = getClient();
  if (!s3 || !key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (_) {
    // Already gone or not managed by this app.
  }
}
