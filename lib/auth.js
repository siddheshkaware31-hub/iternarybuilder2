const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'velocity-holiday-sales-academy-dev-secret';
const COOKIE_NAME = 'vha_session';

function sign(value) {
  const h = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  return `${value}.${h}`;
}

function unsign(signed) {
  if (!signed) return null;
  const idx = signed.lastIndexOf('.');
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  try {
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return value;
  } catch (e) {
    return null;
  }
  return null;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setSessionCookie(res, sessionId) {
  const token = sign(sessionId);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function getSessionIdFromReq(req) {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  return unsign(raw);
}

module.exports = {
  setSessionCookie,
  clearSessionCookie,
  getSessionIdFromReq,
};
