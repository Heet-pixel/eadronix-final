import { randomUUID } from "crypto";
import { Readable } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

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
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    // Any S3-side failure (missing object, wrong region/credentials, a
    // permissions issue, or the AWS SDK's own error-body parsing failing
    // on an unexpected response) should behave like "file not found" to
    // the caller — never let it crash the request. files.routes.js already
    // turns a null return into a clean 404.
    console.warn(
      `[s3Storage] getS3FileMeta("${key}") failed:`,
      err.message || err,
    );
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
    console.warn(
      `[s3Storage] openS3DownloadStream("${key}") failed:`,
      err.message || err,
    );
    return null;
  }
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
