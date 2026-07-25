export function ok(res, data = {}, message = 'OK') {
  return res.json({ ok: true, success: true, message, data, ...data });
}

export function fail(res, status = 400, message = 'Request failed') {
  return res.status(status).json({ ok: false, success: false, message });
}
