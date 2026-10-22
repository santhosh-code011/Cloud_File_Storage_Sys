const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { hashPassword } = require('./auth');

const DB_PATH = path.join(__dirname, 'cloud_storage.db');
const db = new DatabaseSync(DB_PATH);

// Initialize schema and pragmas
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    quota_bytes INTEGER DEFAULT 104857600, -- 100 MB default quota
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    is_starred INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    shared_with_email TEXT COLLATE NOCASE,
    permission TEXT DEFAULT 'download', -- 'view' or 'download'
    share_token TEXT UNIQUE,
    is_public INTEGER DEFAULT 0,
    password_hash TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Pre-seed demo users if none exist
const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
const { count } = countStmt.get();

if (count === 0) {
  console.log('[Database] Pre-seeding default demo accounts for academic evaluation...');
  const user1 = hashPassword('Password123!');
  const user2 = hashPassword('Password123!');

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, salt, quota_bytes)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertUser.run('Alice Smith', 'alice@cloud.io', user1.hash, user1.salt, 104857600);
  insertUser.run('Bob Johnson', 'bob@cloud.io', user2.hash, user2.salt, 104857600);
  console.log('[Database] Seeded users: alice@cloud.io & bob@cloud.io (Password: Password123!)');
}

// User Helpers
function getUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email.trim().toLowerCase());
}

function getUserById(id) {
  const stmt = db.prepare('SELECT id, name, email, quota_bytes, created_at FROM users WHERE id = ?');
  return stmt.get(id);
}

function createUser(name, email, passwordHash, salt) {
  const stmt = db.prepare(`
    INSERT INTO users (name, email, password_hash, salt, quota_bytes)
    VALUES (?, ?, ?, ?, 104857600)
  `);
  const result = stmt.run(name.trim(), email.trim().toLowerCase(), passwordHash, salt);
  return result.lastInsertRowid;
}

function getUserStorageUsage(userId) {
  const stmt = db.prepare('SELECT COALESCE(SUM(size), 0) AS total_used FROM files WHERE user_id = ?');
  const res = stmt.get(userId);
  return res ? Number(res.total_used) : 0;
}

// File Helpers
function insertFile({ id, userId, filename, storedName, mimeType, size }) {
  const stmt = db.prepare(`
    INSERT INTO files (id, user_id, filename, stored_name, mime_type, size)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, userId, filename, storedName, mimeType, size);
  return getFileById(id);
}

function getFileById(id) {
  const stmt = db.prepare(`
    SELECT f.*, u.name as owner_name, u.email as owner_email
    FROM files f
    JOIN users u ON f.user_id = u.id
    WHERE f.id = ?
  `);
  return stmt.get(id);
}

function getFilesByUser(userId) {
  const stmt = db.prepare(`
    SELECT f.*, 
      (SELECT COUNT(*) FROM shares s WHERE s.file_id = f.id) as share_count
    FROM files f
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `);
  return stmt.all(userId);
}

function toggleStar(fileId, userId) {
  const file = db.prepare('SELECT is_starred FROM files WHERE id = ? AND user_id = ?').get(fileId, userId);
  if (!file) return null;
  const newStar = file.is_starred ? 0 : 1;
  const update = db.prepare('UPDATE files SET is_starred = ? WHERE id = ? AND user_id = ?');
  update.run(newStar, fileId, userId);
  return newStar;
}

function renameFile(fileId, userId, newName) {
  const update = db.prepare('UPDATE files SET filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
  const result = update.run(newName.trim(), fileId, userId);
  return result.changes > 0;
}

function deleteFile(fileId, userId) {
  const file = db.prepare('SELECT stored_name FROM files WHERE id = ? AND user_id = ?').get(fileId, userId);
  if (!file) return null;
  const del = db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?');
  del.run(fileId, userId);
  return file.stored_name;
}

// Sharing Helpers
function createShare({ id, fileId, ownerId, sharedWithEmail = null, permission = 'download', shareToken = null, isPublic = 0, passwordHash = null, expiresAt = null }) {
  const stmt = db.prepare(`
    INSERT INTO shares (id, file_id, owner_id, shared_with_email, permission, share_token, is_public, password_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, fileId, ownerId, sharedWithEmail ? sharedWithEmail.toLowerCase().trim() : null, permission, shareToken, isPublic, passwordHash, expiresAt);
  return getShareById(id);
}

function getShareById(id) {
  const stmt = db.prepare('SELECT * FROM shares WHERE id = ?');
  return stmt.get(id);
}

function getShareByToken(token) {
  const stmt = db.prepare(`
    SELECT s.*, f.filename, f.size, f.mime_type, f.stored_name, u.name as owner_name, u.email as owner_email
    FROM shares s
    JOIN files f ON s.file_id = f.id
    JOIN users u ON s.owner_id = u.id
    WHERE s.share_token = ?
  `);
  return stmt.get(token);
}

function getSharesByFile(fileId, ownerId) {
  const stmt = db.prepare(`
    SELECT id, shared_with_email, permission, share_token, is_public, expires_at, created_at
    FROM shares
    WHERE file_id = ? AND owner_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(fileId, ownerId);
}

function getFilesSharedWithUser(userEmail) {
  const stmt = db.prepare(`
    SELECT f.*, s.id as share_id, s.permission, s.created_at as shared_at, u.name as owner_name, u.email as owner_email
    FROM shares s
    JOIN files f ON s.file_id = f.id
    JOIN users u ON s.owner_id = u.id
    WHERE s.shared_with_email = ?
    ORDER BY s.created_at DESC
  `);
  return stmt.all(userEmail.toLowerCase().trim());
}

function revokeShare(shareId, ownerId) {
  const stmt = db.prepare('DELETE FROM shares WHERE id = ? AND owner_id = ?');
  const res = stmt.run(shareId, ownerId);
  return res.changes > 0;
}

// Activity Logging
function logActivity(userId, action, details) {
  try {
    const stmt = db.prepare('INSERT INTO activities (user_id, action, details) VALUES (?, ?, ?)');
    stmt.run(userId, action, details);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

function getUserActivities(userId, limit = 20) {
  const stmt = db.prepare('SELECT * FROM activities WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?');
  return stmt.all(userId, limit);
}

module.exports = {
  db,
  getUserByEmail,
  getUserById,
  createUser,
  getUserStorageUsage,
  insertFile,
  getFileById,
  getFilesByUser,
  toggleStar,
  renameFile,
  deleteFile,
  createShare,
  getShareById,
  getShareByToken,
  getSharesByFile,
  getFilesSharedWithUser,
  revokeShare,
  logActivity,
  getUserActivities
};
