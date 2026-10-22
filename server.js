const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const db = require('./db');
const { hashPassword, verifyPassword, signToken, authMiddleware } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads folder exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB per file upload limit
});

const requireAuth = authMiddleware(db);

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

// Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Please provide full name, email, and password.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existingUser = db.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const { salt, hash } = hashPassword(password);
    const userId = db.createUser(name, email, hash, salt);

    db.logActivity(userId, 'REGISTER', 'User created their cloud account');
    const token = signToken({ userId, email });

    res.status(201).json({
      message: 'Account registered successfully!',
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        quota_bytes: 104857600,
        used_bytes: 0
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter both email and password.' });
    }

    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValid = verifyPassword(password, user.salt, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken({ userId: user.id, email: user.email });
    const usedBytes = db.getUserStorageUsage(user.id);

    db.logActivity(user.id, 'LOGIN', 'Logged in to cloud storage console');

    res.json({
      message: 'Authentication successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        quota_bytes: user.quota_bytes,
        used_bytes: usedBytes
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// Get current user profile & storage quota
app.get('/api/auth/me', requireAuth, (req, res) => {
  const usedBytes = db.getUserStorageUsage(req.user.id);
  res.json({
    user: {
      ...req.user,
      used_bytes: usedBytes
    }
  });
});

// ==========================================
// 2. CLOUD FILE MANAGEMENT ENDPOINTS
// ==========================================

// List files of logged-in user
app.get('/api/files', requireAuth, (req, res) => {
  try {
    const files = db.getFilesByUser(req.user.id);
    const usedBytes = db.getUserStorageUsage(req.user.id);
    res.json({
      files,
      storage: {
        used_bytes: usedBytes,
        quota_bytes: req.user.quota_bytes,
        free_bytes: Math.max(0, req.user.quota_bytes - usedBytes),
        percent: Math.min(100, Math.round((usedBytes / req.user.quota_bytes) * 100))
      }
    });
  } catch (err) {
    console.error('Fetch files error:', err);
    res.status(500).json({ error: 'Failed to retrieve files.' });
  }
});

// Upload a new file with cloud quota check
app.post('/api/files/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file was provided for upload.' });
    }

    const currentUsed = db.getUserStorageUsage(req.user.id);
    const newUsed = currentUsed + req.file.size;

    // Check Cloud Quota Limit
    if (newUsed > req.user.quota_bytes) {
      // Exceeded! Delete uploaded file from disk
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: `Cloud storage quota exceeded. Available: ${Math.round((req.user.quota_bytes - currentUsed) / 1024)} KB. Upload size: ${Math.round(req.file.size / 1024)} KB.`
      });
    }

    const fileId = crypto.randomUUID();
    const newFile = db.insertFile({
      id: fileId,
      userId: req.user.id,
      filename: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size
    });

    db.logActivity(req.user.id, 'UPLOAD', `Uploaded "${req.file.originalname}" (${(req.file.size / 1024).toFixed(1)} KB)`);

    res.status(201).json({
      message: 'File successfully uploaded to cloud.',
      file: newFile
    });
  } catch (err) {
    console.error('Upload error:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload file.' });
  }
});

// Download a user's file or shared file
app.get('/api/files/:id/download', requireAuth, (req, res) => {
  try {
    const file = db.getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    // Check access permission (owner or recipient)
    let hasAccess = file.user_id === req.user.id;
    if (!hasAccess) {
      // Check if file is shared with user
      const sharedFiles = db.getFilesSharedWithUser(req.user.email);
      const isShared = sharedFiles.some(f => f.id === file.id && f.permission !== 'view_only');
      if (isShared) hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to download this file.' });
    }

    const filePath = path.join(UPLOADS_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File content missing from storage.' });
    }

    db.logActivity(req.user.id, 'DOWNLOAD', `Downloaded "${file.filename}"`);
    res.download(filePath, file.filename);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to download file.' });
  }
});

// Stream / Preview file inline
app.get('/api/files/:id/preview', requireAuth, (req, res) => {
  try {
    const file = db.getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    let hasAccess = file.user_id === req.user.id;
    if (!hasAccess) {
      const sharedFiles = db.getFilesSharedWithUser(req.user.email);
      hasAccess = sharedFiles.some(f => f.id === file.id);
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const filePath = path.join(UPLOADS_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File content missing.' });
    }

    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: 'Failed to preview file.' });
  }
});

// Toggle star / favorite
app.patch('/api/files/:id/star', requireAuth, (req, res) => {
  try {
    const newStatus = db.toggleStar(req.params.id, req.user.id);
    if (newStatus === null) {
      return res.status(404).json({ error: 'File not found or permission denied.' });
    }
    res.json({ is_starred: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle star.' });
  }
});

// Rename file
app.patch('/api/files/:id/rename', requireAuth, (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename || !filename.trim()) {
      return res.status(400).json({ error: 'New filename cannot be empty.' });
    }
    const success = db.renameFile(req.params.id, req.user.id, filename);
    if (!success) {
      return res.status(404).json({ error: 'File not found.' });
    }
    db.logActivity(req.user.id, 'RENAME', `Renamed file to "${filename}"`);
    res.json({ message: 'File renamed successfully.', filename: filename.trim() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename file.' });
  }
});

// Delete file
app.delete('/api/files/:id', requireAuth, (req, res) => {
  try {
    const storedName = db.deleteFile(req.params.id, req.user.id);
    if (!storedName) {
      return res.status(404).json({ error: 'File not found or unauthorized.' });
    }

    const filePath = path.join(UPLOADS_DIR, storedName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.logActivity(req.user.id, 'DELETE', `Deleted file from storage`);
    res.json({ message: 'File deleted permanently.' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

// ==========================================
// 3. FILE SHARING & COLLABORATION ENDPOINTS
// ==========================================

// Create a share (Direct to user OR Public Link)
app.post('/api/files/:id/share', requireAuth, (req, res) => {
  try {
    const file = db.getFileById(req.params.id);
    if (!file || file.user_id !== req.user.id) {
      return res.status(404).json({ error: 'File not found or unauthorized.' });
    }

    const { sharedWithEmail, permission = 'download', isPublic = false, expiresHours = 0, password = '' } = req.body;

    const shareId = crypto.randomUUID();
    let shareToken = null;
    let passwordHash = null;
    let expiresAt = null;

    if (expiresHours > 0) {
      const expDate = new Date();
      expDate.setHours(expDate.getHours() + Number(expiresHours));
      expiresAt = expDate.toISOString();
    }

    if (password && password.trim()) {
      const pHash = hashPassword(password.trim());
      passwordHash = `${pHash.salt}:${pHash.hash}`;
    }

    if (isPublic) {
      shareToken = crypto.randomBytes(16).toString('hex');
    }

    const newShare = db.createShare({
      id: shareId,
      fileId: file.id,
      ownerId: req.user.id,
      sharedWithEmail: isPublic ? null : sharedWithEmail,
      permission: permission === 'view' ? 'view' : 'download',
      shareToken,
      isPublic: isPublic ? 1 : 0,
      passwordHash,
      expiresAt
    });

    const actionDesc = isPublic
      ? `Generated public share link for "${file.filename}"`
      : `Shared "${file.filename}" with ${sharedWithEmail} (${permission})`;
    db.logActivity(req.user.id, 'SHARE', actionDesc);

    res.status(201).json({
      message: 'Share created successfully.',
      share: newShare,
      publicLink: isPublic ? `${req.protocol}://${req.get('host')}/#share/${shareToken}` : null
    });
  } catch (err) {
    console.error('Create share error:', err);
    res.status(500).json({ error: 'Failed to create share.' });
  }
});

// Get shares for a specific file
app.get('/api/files/:id/shares', requireAuth, (req, res) => {
  try {
    const shares = db.getSharesByFile(req.params.id, req.user.id);
    res.json({ shares });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shares.' });
  }
});

// Revoke share
app.delete('/api/shares/:id', requireAuth, (req, res) => {
  try {
    const success = db.revokeShare(req.params.id, req.user.id);
    if (!success) {
      return res.status(404).json({ error: 'Share not found or unauthorized.' });
    }
    db.logActivity(req.user.id, 'REVOKE', `Revoked access to shared file`);
    res.json({ message: 'Share access revoked successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke share.' });
  }
});

// Get all files shared with current user
app.get('/api/files/shared-with-me', requireAuth, (req, res) => {
  try {
    const files = db.getFilesSharedWithUser(req.user.email);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shared files.' });
  }
});

// ==========================================
// 4. PUBLIC SHARE ACCESS (NO LOGIN REQUIRED)
// ==========================================

// Get metadata for a public link
app.get('/api/public/share/:token', (req, res) => {
  try {
    const share = db.getShareByToken(req.params.token);
    if (!share) {
      return res.status(404).json({ error: 'Shared link is invalid or has expired.' });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This shared link has expired.' });
    }

    res.json({
      filename: share.filename,
      size: share.size,
      mime_type: share.mime_type,
      owner_name: share.owner_name,
      permission: share.permission,
      requiresPassword: !!share.password_hash,
      expires_at: share.expires_at
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load public share.' });
  }
});

// Verify password for protected public share
app.post('/api/public/share/:token/verify', (req, res) => {
  try {
    const share = db.getShareByToken(req.params.token);
    if (!share) return res.status(404).json({ error: 'Link invalid.' });

    const { password } = req.body;
    if (!share.password_hash) return res.json({ success: true });

    const [salt, storedHash] = share.password_hash.split(':');
    const isValid = verifyPassword(password || '', salt, storedHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect passcode.' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// Download public shared file
app.get('/api/public/share/:token/download', (req, res) => {
  try {
    const share = db.getShareByToken(req.params.token);
    if (!share) {
      return res.status(404).send('Invalid or expired link.');
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).send('This shared link has expired.');
    }

    if (share.password_hash) {
      const pass = req.query.password || '';
      const [salt, storedHash] = share.password_hash.split(':');
      if (!verifyPassword(pass, salt, storedHash)) {
        return res.status(401).send('Password required or incorrect.');
      }
    }

    const filePath = path.join(UPLOADS_DIR, share.stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File missing from storage.');
    }

    res.download(filePath, share.filename);
  } catch (err) {
    res.status(500).send('Error downloading shared file.');
  }
});

// Preview public shared file
app.get('/api/public/share/:token/preview', (req, res) => {
  try {
    const share = db.getShareByToken(req.params.token);
    if (!share) return res.status(404).send('Invalid link');

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).send('Expired link');
    }

    const filePath = path.join(UPLOADS_DIR, share.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).send('Missing file');

    res.setHeader('Content-Type', share.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${share.filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).send('Error previewing file');
  }
});

// ==========================================
// 5. USER ACTIVITIES AUDIT TRAIL
// ==========================================
app.get('/api/activities', requireAuth, (req, res) => {
  try {
    const activities = db.getUserActivities(req.user.id, 25);
    res.json({ activities });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve activity log.' });
  }
});

// Fallback route for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`Cloud Storage & Sharing System running at:`);
  console.log(`  -> Local: http://localhost:${PORT}`);
  console.log(`Default Demo Accounts:`);
  console.log(`  1. alice@cloud.io   | Password: Password123!`);
  console.log(`  2. bob@cloud.io     | Password: Password123!`);
  console.log(`====================================================`);
});
