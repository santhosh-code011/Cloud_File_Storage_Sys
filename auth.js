const crypto = require('node:crypto');

// Secret key for HMAC token signing (can be overridden by environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'cloud_storage_super_secure_academic_key_2026';

/**
 * Hash a plain password using PBKDF2/scrypt with random salt
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

/**
 * Verify a plain password against the stored salt and hash
 */
function verifyPassword(password, salt, storedHash) {
  try {
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(testHash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (err) {
    return false;
  }
}

/**
 * Helper: Base64URL encode/decode
 */
function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * Generate a cryptographically signed HMAC-SHA256 token
 */
function signToken(payload, expiresInSeconds = 86400 * 7) { // 7 days default
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp, iat: Math.floor(Date.now() / 1000) };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('base64url');

  return `${data}.${signature}`;
}

/**
 * Verify HMAC-SHA256 signed token
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('base64url');

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Express middleware to authenticate requests via Bearer token
 */
function authMiddleware(db) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);

    if (!payload || !payload.userId) {
      return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    }

    const user = db.getUserById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }

    // Attach user (without password hash) to request
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      quota_bytes: user.quota_bytes
    };
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  authMiddleware
};
