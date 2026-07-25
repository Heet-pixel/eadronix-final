// src/utils/gridfs.js
//
// Spec item 2: store uploaded files (student/teacher profile photos, college
// logos, assignment PDFs, notices/documents, Excel imports, anything else
// uploaded) on MongoDB Atlas properly, using GridFS — instead of embedding
// raw base64 data directly inside regular documents (which is what this
// codebase did everywhere before: User.avatar, Notice.attachment,
// Syllabus.attachment were all literal `data:...;base64,...` strings saved
// straight onto the document).
//
// Why this matters: MongoDB documents have a 16MB hard limit, and stuffing
// base64 blobs into them bloats every query that touches that document even
// when the caller doesn't need the file itself. GridFS stores the binary
// separately (chunked) and the parent document just keeps a short reference.
//
// Design choice that keeps every existing frontend page working unchanged:
// the field that used to hold `data:image/png;base64,...` now holds
// `/api/files/<gridfsId>` instead — still just a string the frontend drops
// straight into <img src="..."> or <a href="...">, so zero frontend changes
// were needed to benefit from this migration.

import mongoose from 'mongoose';
import { GridFSBucket, ObjectId } from 'mongodb';
import { storeDataUriOnS3, deleteS3File } from './s3Storage.js';

const BUCKET_NAME = 'uploads';
let _bucket = null;

function getBucket() {
  if (_bucket) return _bucket;
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
  _bucket = new GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
  return _bucket;
}

/**
 * storeDataUri()
 * Uploads a base64 data URI to GridFS and returns a servable URL string.
 * If the input isn't a data URI (e.g. it's already a GridFS URL, an http(s)
 * URL, or empty), it's returned unchanged — this makes the function safe to
 * call unconditionally on every save, including edits where the field
 * didn't actually change.
 *
 * @param {string} dataUri - "data:<mime>;base64,<data>" or a passthrough value.
 * @param {string} filenameHint - stored as GridFS filename metadata (for
 *        admin/debugging visibility in Atlas — not user-facing).
 * @returns {Promise<string>} the original value, or "/api/files/<id>".
 */
export async function storeDataUri(dataUri, filenameHint = 'file') {
  if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:')) return dataUri;
  const s3Url = await storeDataUriOnS3(dataUri, filenameHint);
  if (s3Url) return s3Url;
  const match = dataUri.match(/^data:([^;,]+)(;[^,]*)?,(.+)$/);
  if (!match) return dataUri;
  const contentType = match[1] || 'application/octet-stream';
  const isBase64 = /;base64/.test(match[2] || '');
  const payload = match[3];
  const buffer = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');

  const bucket = getBucket();
  if (!bucket) return dataUri; // DB not ready — don't lose the upload, fall back to inline storage this one time

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filenameHint, { contentType });
    uploadStream.end(buffer);
    uploadStream.on('finish', () => resolve(`/api/files/${uploadStream.id}`));
    uploadStream.on('error', reject);
  });
}

/** Deletes a previously-stored file, given the "/api/files/<id>" URL we handed back. Safe to call on any string. */
export async function deleteStoredFile(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return;
  await deleteS3File(fileUrl);
  const m = fileUrl.match(/\/api\/files\/([a-f0-9]{24})$/);
  if (!m) return;
  const bucket = getBucket();
  if (!bucket) return;
  try {
    await bucket.delete(new ObjectId(m[1]));
  } catch (_) { /* already gone / never existed — fine */ }
}

/** Used by the file-serving route (see routes/files.routes.js) to stream a file back by its GridFS id. */
export function openDownloadStream(id) {
  const bucket = getBucket();
  if (!bucket) return null;
  return bucket.openDownloadStream(new ObjectId(id));
}

export async function findFileMeta(id) {
  const bucket = getBucket();
  if (!bucket) return null;
  const docs = await bucket.find({ _id: new ObjectId(id) }).toArray();
  return docs[0] || null;
}
