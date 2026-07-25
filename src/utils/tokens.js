import jwt from 'jsonwebtoken';

function secret(name, fallback) {
  const value = process.env[name];
  if (process.env.NODE_ENV === 'production') {
    if (!value || value.length < 32 || /change_me|replace_with|dev_/i.test(value)) {
      throw new Error(`${name} must be set to a strong secret before production deploy.`);
    }
  }
  return value || fallback;
}

const accessSecret = () => secret('JWT_ACCESS_SECRET', 'dev_access_secret_change_me');
const refreshSecret = () => secret('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me');

export function signAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role }, accessSecret(), { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' });
}

export function signRefresh(user, deviceId) {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
  return jwt.sign({ sub: user.id, role: user.role, deviceId }, refreshSecret(), { expiresIn: `${days}d` });
}

export function verifyAccess(token) {
  return jwt.verify(token, accessSecret());
}

export function verifyRefresh(token) {
  return jwt.verify(token, refreshSecret());
}

export function signTemp(payload) {
  return jwt.sign(payload, accessSecret(), { expiresIn: '15m' });
}

export function verifyTemp(token) {
  return jwt.verify(token, accessSecret());
}
