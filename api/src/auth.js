import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { query, num } from './db.js';

// compared against when the username does not exist, so response time does not reveal valid usernames
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function verifyLogin(conn, username, password) {
  const [user] = await query(
    conn,
    `SELECT user_id, username, password_hash, role, full_name, clinic_id, guardian_id
       FROM app_users WHERE LOWER(username) = LOWER(:username)
      ORDER BY user_id FETCH FIRST 1 ROWS ONLY`,
    { username },
  );
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid username or password');
  return user;
}

export function signToken(user) {
  return jwt.sign(
    { role: user.role, clinicId: user.clinic_id ?? null, guardianId: user.guardian_id ?? null },
    config.jwtSecret,
    { subject: String(user.user_id), expiresIn: config.jwtExpiresIn },
  );
}

/** Reads `Authorization: Bearer <jwt>` and sets req.user; 401 when missing or invalid */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Authentication required'));
  try {
    const claims = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: Number(claims.sub),
      role: claims.role,
      clinicId: claims.clinicId,
      guardianId: claims.guardianId,
    };
    return next();
  } catch {
    return next(new HttpError(401, 'Session expired or invalid; please sign in again'));
  }
}

/** 403 unless the signed-in user has one of the listed roles */
export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have access to this'));

/**
 * Clinic a request may act on.
 *  ADMIN: the requested clinic (or null = all clinics when `required` is false)
 *  NURSE: always their own clinic; asking for another one is 403
 */
export function resolveClinic(req, requested, { required = false } = {}) {
  if (req.user.role === 'NURSE') {
    if (requested != null && requested !== req.user.clinicId) {
      throw new HttpError(403, 'You can only work with your own clinic');
    }
    return req.user.clinicId;
  }
  if (req.user.role === 'ADMIN') {
    if (required && requested == null) throw new HttpError(400, 'clinicId is required');
    return requested ?? null;
  }
  throw new HttpError(403, 'You do not have access to this');
}

/** Loads a baby's clinic and guardian and checks the signed-in user may see it */
export async function assertBabyAccess(conn, req, babyId) {
  const [baby] = await query(
    conn,
    'SELECT baby_id, clinic_id, guardian_id FROM newborns WHERE baby_id = :id',
    { id: num(babyId) },
  );
  if (!baby) throw new HttpError(404, 'Baby not found');
  const { role, clinicId, guardianId } = req.user;
  const allowed =
    role === 'ADMIN' ||
    (role === 'NURSE' && baby.clinic_id === clinicId) ||
    (role === 'PARENT' && baby.guardian_id === guardianId);
  if (!allowed) throw new HttpError(403, 'You do not have access to this baby');
  return baby;
}

// ---- tiny in-memory login throttle: 10 failed attempts per IP + username per 15 minutes
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

export const loginThrottle = {
  check(key) {
    const entry = attempts.get(key);
    if (entry && Date.now() - entry.first > WINDOW_MS) attempts.delete(key);
    if ((attempts.get(key)?.count ?? 0) >= MAX_FAILS) {
      throw new HttpError(429, 'Too many failed sign-in attempts; try again in a few minutes');
    }
  },
  fail(key) {
    const entry = attempts.get(key);
    if (!entry) attempts.set(key, { count: 1, first: Date.now() });
    else entry.count += 1;
  },
  reset(key) {
    attempts.delete(key);
  },
};
