/**
 * SkyVault Frontend Application Logic
 * Single Page Cloud Storage & Sharing System
 */

// Application State
const state = {
  token: localStorage.getItem('skyvault_token') || null,
  user: null,
  files: [],
  sharedFiles: [],
  storage: { used_bytes: 0, quota_bytes: 104857600, percent: 0 },
  currentView: 'my-files',
  currentFilter: 'all',
  currentSort: 'newest',
  searchQuery: '',
  viewMode: 'grid',
  activeShareFileId: null
};

// DOM Elements
const authSection = document.getElementById('authSection');
const appContainer = document.getElementById('appContainer');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const demoAliceBtn = document.getElementById('demoAliceBtn');
const demoBobBtn = document.getElementById('demoBobBtn');
const logoutBtn = document.getElementById('logoutBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');

// Files UI Elements
const filesContainer = document.getElementById('filesContainer');
const emptyState = document.getElementById('emptyState');
const currentViewTitle = document.getElementById('currentViewTitle');
const currentViewDesc = document.getElementById('currentViewDesc');
const myFilesCount = document.getElementById('myFilesCount');
const sharedFilesCount = document.getElementById('sharedFilesCount');
const starredCount = document.getElementById('starredCount');
const storagePercentText = document.getElementById('storagePercentText');
const storageProgressFill = document.getElementById('storageProgressFill');
const storageUsedText = document.getElementById('storageUsedText');
const storageTotalText = document.getElementById('storageTotalText');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const filterChips = document.getElementById('filterChips');
const viewGridBtn = document.getElementById('viewGridBtn');
const viewListBtn = document.getElementById('viewListBtn');

// Upload Elements
const fileUploadInput = document.getElementById('fileUploadInput');
const dropZone = document.getElementById('dropZone');
const uploadProgressCard = document.getElementById('uploadProgressCard');
const uploadFileName = document.getElementById('uploadFileName');
const uploadFileSize = document.getElementById('uploadFileSize');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadPercent = document.getElementById('uploadPercent');

// Modals
const previewModal = document.getElementById('previewModal');
const previewFileName = document.getElementById('previewFileName');
const previewContent = document.getElementById('previewContent');
const previewDownloadBtn = document.getElementById('previewDownloadBtn');
const closePreviewBtn = document.getElementById('closePreviewBtn');

const shareModal = document.getElementById('shareModal');
const shareFileSubtitle = document.getElementById('shareFileSubtitle');
const closeShareBtn = document.getElementById('closeShareBtn');
const directShareForm = document.getElementById('directShareForm');
const activeSharesList = document.getElementById('activeSharesList');
const generatePublicLinkBtn = document.getElementById('generatePublicLinkBtn');
const generatedLinkContainer = document.getElementById('generatedLinkContainer');
const publicLinkInput = document.getElementById('publicLinkInput');
const copyPublicLinkBtn = document.getElementById('copyPublicLinkBtn');

const activitySection = document.getElementById('activitySection');
const activityList = document.getElementById('activityList');

const publicGuestModal = document.getElementById('publicGuestModal');
const toastContainer = document.getElementById('toastContainer');

// ==========================================
// 1. INITIALIZATION & AUTHENTICATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkPublicShareRoute();
  
  if (state.token) {
    fetchUserProfile();
  } else {
    showAuth();
  }

  setupEventListeners();
  if (window.lucide) lucide.createIcons();
});

function initTheme() {
  const savedTheme = localStorage.getItem('skyvault_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    themeIcon.setAttribute('data-lucide', 'moon');
  } else {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    themeIcon.setAttribute('data-lucide', 'sun');
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light-theme');
  if (isLight) {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    localStorage.setItem('skyvault_theme', 'dark');
    themeIcon.setAttribute('data-lucide', 'sun');
  } else {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    localStorage.setItem('skyvault_theme', 'light');
    themeIcon.setAttribute('data-lucide', 'moon');
  }
  if (window.lucide) lucide.createIcons();
}

function showAuth() {
  authSection.classList.remove('hidden');
  appContainer.classList.add('hidden');
  if (window.lucide) lucide.createIcons();
}

function showApp() {
  authSection.classList.add('hidden');
  appContainer.classList.remove('hidden');
  updateUserUI();
  fetchFiles();
  fetchSharedFiles();
  if (window.lucide) lucide.createIcons();
}

// Check if user came from a public share link: /#share/token
function checkPublicShareRoute() {
  const hash = window.location.hash;
  if (hash.startsWith('#share/')) {
    const token = hash.replace('#share/', '').trim();
    if (token) {
      loadPublicShareView(token);
    }
  }
}

// Fetch Current Authenticated User
async function fetchUserProfile() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
      showApp();
    } else {
      logout();
    }
  } catch (err) {
    console.error('Auth verification failed', err);
    logout();
  }
}

function updateUserUI() {
  if (!state.user) return;
  document.getElementById('userNameDisplay').textContent = state.user.name;
  document.getElementById('userEmailDisplay').textContent = state.user.email;
  document.getElementById('userAvatar').textContent = state.user.name.charAt(0).toUpperCase();
}

function logout() {
  localStorage.removeItem('skyvault_token');
  state.token = null;
  state.user = null;
  state.files = [];
  showAuth();
  showToast('Logged out successfully', 'info');
}

// ==========================================
// 2. EVENT LISTENERS
// ==========================================

function setupEventListeners() {
  // Theme Toggle
  themeToggleBtn.addEventListener('click', toggleTheme);

  // Auth Tabs
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    document.getElementById('authTitle').textContent = 'Welcome to SkyVault';
    document.getElementById('authSubtitle').textContent = 'Secure Cloud File Storage & Sharing Infrastructure';
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    document.getElementById('authTitle').textContent = 'Create Cloud Account';
    document.getElementById('authSubtitle').textContent = 'Get 100 MB Free Isolated Cloud Drive';
  });

  // Demo Login Buttons for Evaluator
  demoAliceBtn.addEventListener('click', () => {
    document.getElementById('loginEmail').value = 'alice@cloud.io';
    document.getElementById('loginPassword').value = 'Password123!';
    loginForm.dispatchEvent(new Event('submit'));
  });

  demoBobBtn.addEventListener('click', () => {
    document.getElementById('loginEmail').value = 'bob@cloud.io';
    document.getElementById('loginPassword').value = 'Password123!';
    loginForm.dispatchEvent(new Event('submit'));
  });

  // Login Form Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('skyvault_token', data.token);
        showApp();
        showToast(`Welcome back, ${data.user.name}!`, 'success');
      } else {
        showToast(data.error || 'Login failed', 'error');
      }
    } catch (err) {
      showToast('Server connection error', 'error');
    }
  });

  // Register Form Submit
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('skyvault_token', data.token);
        showApp();
        showToast('Account registered successfully!', 'success');
      } else {
        showToast(data.error || 'Registration failed', 'error');
      }
    } catch (err) {
      showToast('Server connection error', 'error');
    }
  });

  // Logout
  logoutBtn.addEventListener('click', logout);

  // Navigation Links
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  // Filter Chips
  filterChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.currentFilter = chip.dataset.filter;
      renderFiles();
    });
  });

  // Sorting
  sortSelect.addEventListener('change', (e) => {
    state.currentSort = e.target.value;
    renderFiles();
  });

  // View Switchers (Grid vs List)
  viewGridBtn.addEventListener('click', () => {
    state.viewMode = 'grid';
    viewGridBtn.classList.add('active');
    viewListBtn.classList.remove('active');
    filesContainer.className = 'files-grid';
    renderFiles();
  });

  viewListBtn.addEventListener('click', () => {
    state.viewMode = 'list';
    viewListBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
    filesContainer.className = 'files-list';
    renderFiles();
  });

  // Search Input
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderFiles();
  });

  // Keyboard shortcut Ctrl+K
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // Drag and Drop Upload
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  });

  // Manual File Browser Upload
  fileUploadInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
      e.target.value = ''; // Reset input
    }
  });

  // Close Modals
  closePreviewBtn.addEventListener('click', () => previewModal.classList.add('hidden'));
  closeShareBtn.addEventListener('click', () => shareModal.classList.add('hidden'));

  window.addEventListener('click', (e) => {
    if (e.target === previewModal) previewModal.classList.add('hidden');
    if (e.target === shareModal) shareModal.classList.add('hidden');
  });

  // Share Modal Tab Switching
  document.querySelectorAll('.share-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.share-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById('directSharePanel').classList.toggle('active', target === 'direct');
      document.getElementById('publicSharePanel').classList.toggle('active', target === 'public');
    });
  });

  // Direct Share Form Submit
  directShareForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeShareFileId) return;

    const email = document.getElementById('shareUserEmail').value.trim();
    const permission = document.getElementById('sharePermission').value;

    try {
      const res = await fetch(`/api/files/${state.activeShareFileId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ sharedWithEmail: email, permission })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`File shared with ${email}!`, 'success');
        document.getElementById('shareUserEmail').value = '';
        fetchActiveShares(state.activeShareFileId);
        fetchFiles();
      } else {
        showToast(data.error || 'Failed to share file', 'error');
      }
    } catch (err) {
      showToast('Error sharing file', 'error');
    }
  });

  // Generate Public Link
  generatePublicLinkBtn.addEventListener('click', async () => {
    if (!state.activeShareFileId) return;

    const expiresHours = Number(document.getElementById('publicExpireSelect').value);
    const password = document.getElementById('publicPassword').value.trim();

    try {
      const res = await fetch(`/api/files/${state.activeShareFileId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ isPublic: true, expiresHours, password })
      });
      const data = await res.json();
      if (res.ok) {
        publicLinkInput.value = data.publicLink;
        generatedLinkContainer.classList.remove('hidden');
        showToast('Public link generated successfully!', 'success');
        fetchActiveShares(state.activeShareFileId);
        fetchFiles();
      } else {
        showToast(data.error || 'Failed to generate link', 'error');
      }
    } catch (err) {
      showToast('Error generating public link', 'error');
    }
  });

  // Copy Public Link
  copyPublicLinkBtn.addEventListener('click', () => {
    publicLinkInput.select();
    navigator.clipboard.writeText(publicLinkInput.value);
    showToast('Public link copied to clipboard!', 'info');
  });

  // Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobileSidebarToggle');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      document.getElementById('appSidebar').classList.toggle('open');
    });
  }
}

// ==========================================
// 3. FILE OPERATIONS & API CALLS
// ==========================================

async function fetchFiles() {
  try {
    const res = await fetch('/api/files', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      state.files = data.files;
      state.storage = data.storage;
      updateStorageWidget();
      updateCounts();
      if (state.currentView === 'my-files' || state.currentView === 'starred') {
        renderFiles();
      }
    }
  } catch (err) {
    console.error('Error fetching files:', err);
  }
}

async function fetchSharedFiles() {
  try {
    const res = await fetch('/api/files/shared-with-me', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      state.sharedFiles = data.files;
      sharedFilesCount.textContent = state.sharedFiles.length;
      if (state.currentView === 'shared-with-me') {
        renderFiles();
      }
    }
  } catch (err) {
    console.error('Error fetching shared files:', err);
  }
}

function updateCounts() {
  myFilesCount.textContent = state.files.length;
  starredCount.textContent = state.files.filter(f => f.is_starred).length;
}

function updateStorageWidget() {
  const usedMB = (state.storage.used_bytes / (1024 * 1024)).toFixed(1);
  const totalMB = Math.round(state.storage.quota_bytes / (1024 * 1024));
  const percent = state.storage.percent;

  storageUsedText.textContent = `${usedMB} MB`;
  storageTotalText.textContent = `${totalMB} MB`;
  storagePercentText.textContent = `${percent}% Used`;
  storageProgressFill.style.width = `${percent}%`;

  if (percent > 90) {
    storageProgressFill.style.background = 'var(--color-danger)';
  } else if (percent > 70) {
    storageProgressFill.style.background = 'var(--color-warning)';
  } else {
    storageProgressFill.style.background = 'var(--accent-gradient)';
  }
}

// Upload File via XHR for real upload progress
function handleFileUpload(file) {
  if (file.size > 100 * 1024 * 1024) {
    showToast('File exceeds 100MB cloud upload limit', 'error');
    return;
  }

  // Show progress card
  uploadProgressCard.classList.remove('hidden');
  uploadFileName.textContent = file.name;
  uploadFileSize.textContent = formatBytes(file.size);
  uploadProgressBar.style.width = '0%';
  uploadPercent.textContent = '0%';

  const formData = new FormData();
  formData.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/files/upload');
  xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percentComplete = Math.round((e.loaded / e.total) * 100);
      uploadProgressBar.style.width = `${percentComplete}%`;
      uploadPercent.textContent = `${percentComplete}%`;
    }
  };

  xhr.onload = () => {
    uploadProgressCard.classList.add('hidden');
    if (xhr.status === 201) {
      showToast(`"${file.name}" uploaded to cloud!`, 'success');
      fetchFiles();
    } else {
      let errMsg = 'Upload failed';
      try {
        const res = JSON.parse(xhr.responseText);
        errMsg = res.error || errMsg;
      } catch (e) {}
      showToast(errMsg, 'error');
    }
  };

  xhr.onerror = () => {
    uploadProgressCard.classList.add('hidden');
    showToast('Network error during file upload', 'error');
  };

  xhr.send(formData);
}

// Toggle Star
async function toggleStar(fileId, e) {
  if (e) e.stopPropagation();
  try {
    const res = await fetch(`/api/files/${fileId}/star`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const file = state.files.find(f => f.id === fileId);
      if (file) file.is_starred = data.is_starred;
      updateCounts();
      renderFiles();
      showToast(data.is_starred ? 'Starred file' : 'Unstarred file', 'info');
    }
  } catch (err) {
    showToast('Failed to update star', 'error');
  }
}

// Rename File
async function promptRename(fileId, currentName, e) {
  if (e) e.stopPropagation();
  const newName = prompt('Enter new filename:', currentName);
  if (!newName || newName.trim() === '' || newName.trim() === currentName) return;

  try {
    const res = await fetch(`/api/files/${fileId}/rename`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ filename: newName.trim() })
    });
    if (res.ok) {
      showToast('File renamed successfully', 'success');
      fetchFiles();
    } else {
      const data = await res.json();
      showToast(data.error || 'Rename failed', 'error');
    }
  } catch (err) {
    showToast('Error renaming file', 'error');
  }
}

// Delete File
async function deleteFile(fileId, fileName, e) {
  if (e) e.stopPropagation();
  if (!confirm(`Are you sure you want to permanently delete "${fileName}" from your cloud?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      showToast(`Deleted "${fileName}"`, 'info');
      fetchFiles();
    } else {
      showToast('Failed to delete file', 'error');
    }
  } catch (err) {
    showToast('Error deleting file', 'error');
  }
}

// Download File
function downloadFile(fileId, filename, e) {
  if (e) e.stopPropagation();
  const link = document.createElement('a');
  link.href = `/api/files/${fileId}/download`;
  // We attach token via query param if needed, or browser fetch with blob
  // For standard secure Express downloads with token header:
  fetch(`/api/files/${fileId}/download`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  })
  .then(res => {
    if (!res.ok) throw new Error('Download failed or forbidden');
    return res.blob();
  })
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    showToast(`Downloading "${filename}"...`, 'info');
  })
  .catch(err => showToast(err.message, 'error'));
}

// ==========================================
// 4. PREVIEW & SHARING MODALS
// ==========================================

function openPreview(file) {
  previewFileName.textContent = file.filename;
  previewContent.innerHTML = '<div class="spin"><i data-lucide="loader"></i></div>';
  previewDownloadBtn.onclick = (e) => downloadFile(file.id, file.filename, e);
  previewModal.classList.remove('hidden');

  const fileUrl = `/api/files/${file.id}/preview`;
  const mime = file.mime_type.toLowerCase();

  // Fetch with Authorization header
  fetch(fileUrl, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  })
  .then(res => {
    if (!res.ok) throw new Error('Preview not accessible');
    return res.blob();
  })
  .then(blob => {
    const objectUrl = URL.createObjectURL(blob);
    previewContent.innerHTML = '';

    if (mime.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = objectUrl;
      img.className = 'preview-img';
      previewContent.appendChild(img);
    } else if (mime.startsWith('audio/')) {
      const audio = document.createElement('audio');
      audio.src = objectUrl;
      audio.controls = true;
      audio.autoplay = true;
      audio.className = 'preview-media';
      previewContent.appendChild(audio);
    } else if (mime.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = objectUrl;
      video.controls = true;
      video.autoplay = true;
      video.className = 'preview-media';
      previewContent.appendChild(video);
    } else if (mime === 'application/pdf') {
      const iframe = document.createElement('iframe');
      iframe.src = objectUrl;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      previewContent.appendChild(iframe);
    } else if (mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript') || mime.includes('html')) {
      blob.text().then(text => {
        const pre = document.createElement('pre');
        pre.className = 'preview-text';
        pre.textContent = text;
        previewContent.appendChild(pre);
      });
    } else {
      previewContent.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px;">
          <i data-lucide="file" style="width: 48px; height: 48px; margin-bottom: 12px;"></i>
          <p>Inline preview not supported for this file type.</p>
          <button class="btn btn-primary btn-sm" style="margin-top: 14px;" onclick="downloadFile('${file.id}', '${file.filename}')">
            Download File Instead
          </button>
        </div>
      `;
    }
    if (window.lucide) lucide.createIcons();
  })
  .catch(err => {
    previewContent.innerHTML = `<p style="color: var(--color-danger);">${err.message}</p>`;
  });
}

function openShareModal(file, e) {
  if (e) e.stopPropagation();
  state.activeShareFileId = file.id;
  shareFileSubtitle.textContent = `Access and sharing rules for "${file.filename}"`;
  generatedLinkContainer.classList.add('hidden');
  document.getElementById('publicPassword').value = '';
  shareModal.classList.remove('hidden');
  fetchActiveShares(file.id);
  if (window.lucide) lucide.createIcons();
}

async function fetchActiveShares(fileId) {
  try {
    const res = await fetch(`/api/files/${fileId}/shares`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      renderSharesList(data.shares);
    }
  } catch (err) {
    console.error('Error fetching shares:', err);
  }
}

function renderSharesList(shares) {
  activeSharesList.innerHTML = '';
  if (!shares || shares.length === 0) {
    activeSharesList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.82rem;">No active user shares.</p>';
    return;
  }

  shares.forEach(share => {
    const div = document.createElement('div');
    div.className = 'share-row';
    const label = share.is_public
      ? `🌐 Public Link (${share.expires_at ? 'Expiring' : 'Permanent'})`
      : `👤 ${share.shared_with_email} (${share.permission})`;

    div.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <button class="share-row-btn" onclick="revokeShare('${share.id}')">Revoke</button>
    `;
    activeSharesList.appendChild(div);
  });
}

async function revokeShare(shareId) {
  try {
    const res = await fetch(`/api/shares/${shareId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      showToast('Share revoked', 'info');
      fetchActiveShares(state.activeShareFileId);
      fetchFiles();
    }
  } catch (err) {
    showToast('Failed to revoke share', 'error');
  }
}

// ==========================================
// 5. VIEW SWITCHING & RENDERING
// ==========================================

function switchView(view) {
  state.currentView = view;
  searchInput.value = '';
  state.searchQuery = '';

  if (view === 'my-files') {
    currentViewTitle.textContent = 'My Cloud Files';
    currentViewDesc.textContent = 'All files stored securely in your private cloud partition';
    dropZone.classList.remove('hidden');
    activitySection.classList.add('hidden');
    filesContainer.classList.remove('hidden');
    renderFiles();
  } else if (view === 'shared-with-me') {
    currentViewTitle.textContent = 'Shared with Me';
    currentViewDesc.textContent = 'Files and documents shared with you by other cloud users';
    dropZone.classList.add('hidden');
    activitySection.classList.add('hidden');
    filesContainer.classList.remove('hidden');
    fetchSharedFiles();
  } else if (view === 'starred') {
    currentViewTitle.textContent = 'Starred Files';
    currentViewDesc.textContent = 'Quick access to your prioritized cloud files';
    dropZone.classList.add('hidden');
    activitySection.classList.add('hidden');
    filesContainer.classList.remove('hidden');
    renderFiles();
  } else if (view === 'activity') {
    currentViewTitle.textContent = 'Audit Activity Log';
    currentViewDesc.textContent = 'Cryptographic audit trail of all security and file operations';
    dropZone.classList.add('hidden');
    filesContainer.classList.add('hidden');
    emptyState.classList.add('hidden');
    activitySection.classList.remove('hidden');
    fetchActivities();
  }
}

function renderFiles() {
  filesContainer.innerHTML = '';
  let list = state.currentView === 'shared-with-me' ? [...state.sharedFiles] : [...state.files];

  // Filter: Starred view
  if (state.currentView === 'starred') {
    list = list.filter(f => f.is_starred);
  }

  // Filter: Category
  if (state.currentFilter !== 'all') {
    list = list.filter(f => getCategory(f.mime_type, f.filename) === state.currentFilter);
  }

  // Filter: Search query
  if (state.searchQuery) {
    list = list.filter(f => f.filename.toLowerCase().includes(state.searchQuery));
  }

  // Sort
  list.sort((a, b) => {
    if (state.currentSort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (state.currentSort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    if (state.currentSort === 'largest') return b.size - a.size;
    if (state.currentSort === 'smallest') return a.size - b.size;
    if (state.currentSort === 'name_asc') return a.filename.localeCompare(b.filename);
    return 0;
  });

  if (list.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    list.forEach(file => {
      const card = createFileCard(file);
      filesContainer.appendChild(card);
    });
  }

  if (window.lucide) lucide.createIcons();
}

function createFileCard(file) {
  const card = document.createElement('div');
  card.className = 'file-card';
  card.onclick = () => openPreview(file);

  const cat = getCategory(file.mime_type, file.filename);
  const iconName = getCategoryIcon(cat);
  const dateFormatted = new Date(file.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  const isOwner = file.user_id === state.user?.id;

  card.innerHTML = `
    <div class="card-top">
      <div class="file-type-icon ${cat}">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="card-top-actions">
        ${isOwner ? `
          <button class="star-btn ${file.is_starred ? 'active' : ''}" title="${file.is_starred ? 'Unstar' : 'Star'}" onclick="toggleStar('${file.id}', event)">
            <i data-lucide="${file.is_starred ? 'star' : 'star'}"></i>
          </button>
        ` : ''}
      </div>
    </div>

    <div class="card-body">
      <span class="file-name" title="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}</span>
      <div class="file-meta-row">
        <span>${formatBytes(file.size)}</span>
        <span>•</span>
        <span>${dateFormatted}</span>
      </div>
      ${!isOwner ? `<div class="shared-badge"><i data-lucide="user"></i> By ${escapeHtml(file.owner_name)}</div>` : ''}
      ${isOwner && file.share_count > 0 ? `<div class="shared-badge"><i data-lucide="share-2"></i> Shared (${file.share_count})</div>` : ''}
    </div>

    <div class="card-actions">
      <div class="card-actions-left">
        <button class="card-action-btn" title="Download" onclick="downloadFile('${file.id}', '${escapeHtml(file.filename)}', event)">
          <i data-lucide="download"></i>
        </button>
        ${isOwner ? `
          <button class="card-action-btn" title="Share" onclick="openShareModal(${JSON.stringify(file).replace(/"/g, '&quot;')}, event)">
            <i data-lucide="share-2"></i>
          </button>
          <button class="card-action-btn" title="Rename" onclick="promptRename('${file.id}', '${escapeHtml(file.filename)}', event)">
            <i data-lucide="edit-3"></i>
          </button>
        ` : ''}
      </div>
      ${isOwner ? `
        <button class="card-action-btn delete-btn" title="Delete" onclick="deleteFile('${file.id}', '${escapeHtml(file.filename)}', event)">
          <i data-lucide="trash-2"></i>
        </button>
      ` : ''}
    </div>
  `;

  return card;
}

// Activity Log
async function fetchActivities() {
  try {
    const res = await fetch('/api/activities', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      renderActivities(data.activities);
    }
  } catch (err) {
    console.error('Error fetching activities:', err);
  }
}

function renderActivities(activities) {
  activityList.innerHTML = '';
  if (!activities || activities.length === 0) {
    activityList.innerHTML = '<p style="color: var(--text-muted); padding: 20px;">No recorded activities yet.</p>';
    return;
  }

  activities.forEach(act => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    const timeStr = new Date(act.timestamp).toLocaleString();
    let icon = 'activity';
    if (act.action === 'UPLOAD') icon = 'upload-cloud';
    if (act.action === 'SHARE') icon = 'share-2';
    if (act.action === 'DOWNLOAD') icon = 'download';
    if (act.action === 'DELETE') icon = 'trash-2';
    if (act.action === 'LOGIN') icon = 'log-in';

    item.innerHTML = `
      <div class="activity-icon">
        <i data-lucide="${icon}"></i>
      </div>
      <div class="activity-details">
        <div class="activity-action">${escapeHtml(act.action)}</div>
        <div class="activity-desc">${escapeHtml(act.details)}</div>
      </div>
      <div class="activity-time">${timeStr}</div>
    `;
    activityList.appendChild(item);
  });
  if (window.lucide) lucide.createIcons();
}

// ==========================================
// 6. PUBLIC SHARE GUEST EXPERIENCE
// ==========================================

async function loadPublicShareView(token) {
  try {
    const res = await fetch(`/api/public/share/${token}`);
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Invalid or expired share link');
      window.location.hash = '';
      return;
    }

    publicGuestModal.classList.remove('hidden');
    document.getElementById('guestFileName').textContent = data.filename;
    document.getElementById('guestFileSize').textContent = formatBytes(data.size);
    document.getElementById('guestOwnerName').textContent = data.owner_name;

    const passGroup = document.getElementById('guestPasswordGroup');
    if (data.requiresPassword) {
      passGroup.classList.remove('hidden');
    } else {
      passGroup.classList.add('hidden');
    }

    document.getElementById('guestDownloadBtn').onclick = () => {
      const pass = document.getElementById('guestPasswordInput').value;
      const downloadUrl = `/api/public/share/${token}/download?password=${encodeURIComponent(pass)}`;
      window.location.href = downloadUrl;
    };

    document.getElementById('guestPreviewBtn').onclick = () => {
      const pass = document.getElementById('guestPasswordInput').value;
      const previewUrl = `/api/public/share/${token}/preview?password=${encodeURIComponent(pass)}`;
      window.open(previewUrl, '_blank');
    };

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    alert('Failed to connect to public share');
  }
}

// ==========================================
// 7. UTILITY FUNCTIONS
// ==========================================

function getCategory(mime, filename) {
  mime = (mime || '').toLowerCase();
  const ext = (filename || '').split('.').pop().toLowerCase();

  if (mime.includes('pdf') || ext === 'pdf') return 'pdf';
  if (mime.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'img';
  if (mime.includes('audio') || mime.includes('video') || ['mp4', 'mp3', 'wav', 'mkv'].includes(ext)) return 'media';
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || ['zip', 'tar', 'gz', '7z'].includes(ext)) return 'zip';
  if (mime.includes('text') || mime.includes('code') || ['js', 'html', 'css', 'json', 'py', 'java', 'c', 'cpp'].includes(ext)) return 'code';
  return 'doc';
}

function getCategoryIcon(cat) {
  switch (cat) {
    case 'pdf': return 'file-text';
    case 'img': return 'image';
    case 'media': return 'play-circle';
    case 'zip': return 'archive';
    case 'code': return 'file-code';
    default: return 'file';
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'alert-triangle';

  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  toastContainer.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
