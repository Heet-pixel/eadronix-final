import { randomUUID } from "crypto";
import { Readable } from "stream";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

// ============================================================
// AWS S3 CONFIGURATION
// ============================================================

const region =
  process.env.AWS_REGION_s3 ||
  process.env.AWS_DEFAULT_REGION_s3 ||
  "ap-south-1";

const bucket = process.env.AWS_S3_BUCKET_s3 || process.env.S3_BUCKET_s3;

const publicBaseUrl =
  process.env.AWS_S3_PUBLIC_BASE_URL_s3 || process.env.S3_PUBLIC_BASE_URL_s3;

const endpoint = process.env.AWS_S3_ENDPOINT_s3 || undefined;

let client;

// ============================================================
// CREATE S3 CLIENT
// ============================================================

function getClient() {
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET_s3 is not configured.");
  }

  if (!process.env.AWS_ACCESS_KEY_ID_s3) {
    throw new Error("AWS_ACCESS_KEY_ID_s3 is not configured.");
  }

  if (!process.env.AWS_SECRET_ACCESS_KEY_s3) {
    throw new Error("AWS_SECRET_ACCESS_KEY_s3 is not configured.");
  }

  if (!client) {
    client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID_s3,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_s3,
      },
    });
  }

  return client;
}

// ============================================================
// DATA URI PARSER
// ============================================================

function parseDataUri(dataUri) {
  if (!dataUri || typeof dataUri !== "string" || !dataUri.startsWith("data:")) {
    return null;
  }

  const match = dataUri.match(/^data:([^;,]+)(;[^,]*)?,(.+)$/);

  if (!match) {
    return null;
  }

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

// ============================================================
// FILE EXTENSION FROM MIME TYPE
// ============================================================

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

// ============================================================
// UPLOAD DATA URI TO S3
// ============================================================

export async function storeDataUriOnS3(dataUri, filenameHint = "file") {
  const parsed = parseDataUri(dataUri);

  // If it isn't a data URI, return the original value.
  if (!parsed) {
    return dataUri;
  }

  const s3 = getClient();

  if (!s3) {
    return null;
  }

  const safeHint =
    String(filenameHint)
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "file";

  const key =
    `uploads/${new Date().toISOString().slice(0, 10)}/` +
    `${safeHint}-${randomUUID()}.` +
    `${extFromMime(parsed.contentType)}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: parsed.buffer,
      ContentType: parsed.contentType,
    }),
  );

  // If a public S3 base URL is configured,
  // return that URL.
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  // Otherwise use our backend S3 file route.
  return `/api/files/s3/${encodeURIComponent(key)}`;
}

// ============================================================
// CONVERT BACKEND S3 URL TO S3 KEY
// ============================================================

export function parseS3FileUrl(fileUrl) {
  const prefix = "/api/files/s3/";

  if (!fileUrl || typeof fileUrl !== "string" || !fileUrl.startsWith(prefix)) {
    return null;
  }

  return decodeURIComponent(fileUrl.slice(prefix.length));
}

// ============================================================
// GET S3 FILE METADATA
// ============================================================

export async function getS3FileMeta(key) {
  const s3 = getClient();

  if (!s3 || !key) {
    return null;
  }

  return s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

// ============================================================
// OPEN S3 FILE DOWNLOAD STREAM
// ============================================================

// export async function openS3DownloadStream(key) {
//   const s3 = getClient();

//   if (!s3 || !key) {
//     return null;
//   }

//   const result = await s3.send(
//     new GetObjectCommand({
//       Bucket: bucket,
//       Key: key,
//     }),
//   );

//   if (result.Body instanceof Readable) {
//     return result.Body;
//   }

//   return Readable.fromWeb(result.Body);
// }
export async function openS3DownloadStream(key) {
  const s3 = getClient();

  if (!s3 || !key) {
    return null;
  }

  try {
    console.log("========== S3 GET DEBUG ==========");
    console.log("S3 Bucket:", bucket);
    console.log("S3 Region:", region);
    console.log("S3 Endpoint:", endpoint || "AWS DEFAULT");
    console.log("S3 Key:", key);

    const result = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    console.log("S3 GET SUCCESS");
    console.log("S3 ContentType:", result.ContentType);
    console.log("S3 ContentLength:", result.ContentLength);
    console.log("===================================");

    if (result.Body instanceof Readable) {
      return result.Body;
    }

    return Readable.fromWeb(result.Body);
  } catch (error) {
    console.error("========== S3 GET ERROR ==========");
    console.error("Name:", error?.name);
    console.error("Message:", error?.message);
    console.error("Code:", error?.code);
    console.error("Status:", error?.$metadata?.httpStatusCode);
    console.error("Request ID:", error?.$metadata?.requestId);
    console.error("Extended Request ID:", error?.$metadata?.extendedRequestId);
    console.error("Attempts:", error?.$metadata?.attempts);
    console.error("Total Retry Delay:", error?.$metadata?.totalRetryDelay);
    console.error("Cause:", error?.cause);
    console.error("Full Error:", error);
    console.error("===================================");

    throw error;
  }
}
// ============================================================
// DELETE S3 FILE
// ============================================================

export async function deleteS3File(fileUrl) {
  const key = parseS3FileUrl(fileUrl);

  const s3 = getClient();

  if (!s3 || !key) {
    return;
  }

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  } catch (_) {
    // File may already be deleted
    // or may not be managed by this application.
  }
}
