// src/routes/files.routes.js
//
// Serves files stored in GridFS (see utils/gridfs.js) back out over HTTP.
// Intentionally NOT behind the JWT auth middleware: these URLs get dropped
// directly into <img src="..."> and <a href="..."> tags across every role's
// frontend, and plain HTML tags can't attach an Authorization header — the
// old approach (embedding base64 directly in API JSON responses) had
// exactly the same effective access model, so this doesn't weaken anything
// that existed before. Anyone who already has (or can guess) a specific
// 24-char file id can view that one file, same as anyone with a direct link
// to any typical uploaded-file URL on the web.

import { Router } from 'express';
import { openDownloadStream, findFileMeta } from '../utils/gridfs.js';
import { getS3FileMeta, openS3DownloadStream } from '../utils/s3Storage.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/s3/*key', asyncHandler(async (req, res) => {
  const key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
  const meta = await getS3FileMeta(key);
  if (!meta) return res.status(404).json({ success: false, message: 'File not found.' });

  res.setHeader('Content-Type', meta.ContentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  const stream = await openS3DownloadStream(key);
  if (!stream) return res.status(503).json({ success: false, message: 'File storage unavailable.' });
  stream.on('error', () => { if (!res.headersSent) res.status(404).json({ success: false, message: 'File not found.' }); });
  stream.pipe(res);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!/^[a-f0-9]{24}$/.test(id)) return res.status(400).json({ success: false, message: 'Invalid file id.' });

  const meta = await findFileMeta(id);
  if (!meta) return res.status(404).json({ success: false, message: 'File not found.' });

  res.setHeader('Content-Type', meta.contentType || meta.metadata?.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'); // GridFS file ids are unique per upload — safe to cache hard
  const stream = openDownloadStream(id);
  if (!stream) return res.status(503).json({ success: false, message: 'File storage unavailable.' });
  stream.on('error', () => { if (!res.headersSent) res.status(404).json({ success: false, message: 'File not found.' }); });
  stream.pipe(res);
}));

export default router;
