import { createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

const DEFAULT_ALGORITHM = 'sha256';
const COOKIE_NAME = 'afc_admin_session';
const loginAttemptMap = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

const toBase64Url = (value) => Buffer.from(value).toString('base64url');
const fromBase64Url = (value) => Buffer.from(value, 'base64url').toString('utf8');

const createSignature = (payload, secret) => createHmac(DEFAULT_ALGORITHM, secret).update(payload).digest('base64url');

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

export const createAdminSessionCookie = (payload, { secret, expiresInMs = 8 * 60 * 60 * 1000 } = {}) => {
  if (!secret) throw new Error('ADMIN_SESSION_SECRET não configurado.');
  const now = Date.now();
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInMs,
    type: 'admin'
  };
  const encodedBody = toBase64Url(JSON.stringify(body));
  const signature = createSignature(encodedBody, secret);
  return `${COOKIE_NAME}=${encodedBody}.${signature}`;
};

export const verifyAdminSessionCookie = (cookieValue, { secret } = {}) => {
  if (typeof cookieValue !== 'string') return null;
  if (typeof secret !== 'string' || !secret.trim()) return null;
  const normalizedValue = cookieValue.trim();
  const rawValue = normalizedValue.startsWith(`${COOKIE_NAME}=`)
    ? normalizedValue.slice(COOKIE_NAME.length + 1)
    : normalizedValue;
  if (!rawValue) return null;
  const [encodedBody, signature] = rawValue.split('.');
  if (!encodedBody || !signature) return null;
  const expectedSignature = createSignature(encodedBody, secret);
  if (!safeEqual(signature, expectedSignature)) return null;
  const payload = JSON.parse(fromBase64Url(encodedBody));
  if (payload.exp && payload.exp <= Date.now()) return null;
  return payload;
};

export const hashAdminPassword = async (password) => {
  if (typeof password !== 'string' || !password) throw new Error('Senha inválida.');
  return bcrypt.hash(password, 12);
};

export const isAdminPasswordValid = async (password, passwordHash) => {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') return false;
  const normalizedHash = passwordHash.trim();
  if (!normalizedHash) return false;
  try {
    return await bcrypt.compare(password, normalizedHash);
  } catch {
    return false;
  }
};

export const getAdminCookieOptions = (isProduction = false) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/',
  maxAge: 8 * 60 * 60
});

export const getAdminCookieValue = (request) => {
  const header = request.headers?.cookie || request.headers?.Cookie || '';
  if (!header) return '';
  const cookies = header.split(';').map((entry) => entry.trim());
  const sessionCookie = cookies.find((entry) => entry.startsWith(`${COOKIE_NAME}=`));
  return sessionCookie ? sessionCookie.slice(COOKIE_NAME.length + 1) : '';
};

export const clearAdminSessionCookie = () => `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export const createAdminSessionSetCookie = (payload, { secret, expiresInMs = 8 * 60 * 60 * 1000, isProduction = false } = {}) => {
  const cookieValue = createAdminSessionCookie(payload, { secret, expiresInMs });
  const options = getAdminCookieOptions(isProduction);
  const maxAge = options.maxAge;
  return `${cookieValue}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${options.secure ? '; Secure' : ''}`;
};

export const getLoginAttemptState = (key) => {
  const entry = loginAttemptMap.get(key);
  if (!entry) return { count: 0, expiresAt: 0, blocked: false };
  return entry;
};

export const registerLoginAttempt = (key) => {
  const now = Date.now();
  const existing = loginAttemptMap.get(key);
  const entry = existing && existing.expiresAt > now
    ? existing
    : { count: 0, expiresAt: now + LOGIN_LOCKOUT_MS, blocked: false };

  if (entry.expiresAt <= now) {
    entry.count = 0;
    entry.expiresAt = now + LOGIN_LOCKOUT_MS;
    entry.blocked = false;
  }

  if (entry.blocked) {
    loginAttemptMap.set(key, entry);
    return entry;
  }

  entry.count += 1;
  entry.blocked = entry.count >= MAX_LOGIN_ATTEMPTS;
  if (entry.blocked) {
    entry.expiresAt = now + LOGIN_LOCKOUT_MS;
  }
  loginAttemptMap.set(key, entry);
  return entry;
};

export const resetLoginAttempts = (key) => {
  loginAttemptMap.delete(key);
};
