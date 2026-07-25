import User from '../models/User.js';
import { verifyAccess } from '../utils/tokens.js';
import { fail } from '../utils/respond.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 401, 'Authentication required.');
  try {
    const payload = verifyAccess(token);
    const user = await User.findById(payload.sub).select('+sessions.refreshTokenHash');
    if (!user || user.isDeleted || !user.active) return fail(res, 401, 'User is inactive.');
    req.user = user;
    next();
  } catch {
    return fail(res, 401, 'Invalid or expired token.');
  }
}

export function allowRoles(...roles) {
  const normalized = roles.flat().map(r => String(r).toLowerCase());
  return (req, res, next) => {
    const role = String(req.user?.role || '').toLowerCase();
    if (!normalized.includes(role)) return fail(res, 403, 'You are not authorised for this action.');
    next();
  };
}
