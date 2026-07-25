import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const region =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1";
const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;
const publicBaseUrl =
  process.env.AWS_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL;
const endpoint = process.env.AWS_S3_ENDPOINT || undefined;

let client;
function getClient() {
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is not configured.");
  }
  if (!client) client = new S3Client({ region, endpoint });
  return client;
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
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: parsed.buffer,
      ContentType: parsed.contentType,
    }),
  );

  if (publicBaseUrl) return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
  return `/api/files/s3/${encodeURIComponent(key)}`;
}

export function parseS3FileUrl(fileUrl) {
  const prefix = "/api/files/s3/";
  if (!fileUrl || typeof fileUrl !== "string" || !fileUrl.startsWith(prefix))
    return null;
  return decodeURIComponent(fileUrl.slice(prefix.length));
}

export async function getS3FileMeta(key) {
  const s3 = getClient();
  if (!s3 || !key) return null;
  return s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}

export async function openS3DownloadStream(key) {
  const s3 = getClient();
  if (!s3 || !key) return null;
  const result = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (result.Body instanceof Readable) return result.Body;
  return Readable.fromWeb(result.Body);
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
