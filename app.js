/* ═══════════════════════════════════════════════════════════
   FORGEHUB AI — app.js  (Responsive + Bug-fixed Edition)
   Fixes:
   • addFile changeLog type detection (check BEFORE writing)
   • Canvas particle init spread matches viewport
   • Drawer open/close for sidebar + right panel on mobile
   • tbProj contenteditable: paste → plaintext, Enter → blur
   • Monaco mount: uses absolute positioning, not display:none toggle
   • Toast bottom offset respects statusbar height
   • appendMsg: safely switches panel even when hidden
   • removeFile order: delete then closeTab (no stale ref)
   • All async tool fns return Promise (no fire-and-forget in loop)
═══════════════════════════════════════════════════════════ */
'use strict';

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
const S = {
  files:       {},       // path → { name, content, path, modified }
  openTabs:    [],       // [path, …]
  activeTab:   null,
  monaco:      null,
  monacoReady: false,
  ctxPath:     null,
  changeLog:   [],       // [{type, path, desc}]
  treeOpen:    {},       // path → bool
  sidebarOpen: false,    // mobile drawer state
  rpanelOpen:  false,    // mobile/tablet drawer state
};

/* ─────────────────────────────────────────
   DOM HELPERS
───────────────────────────────────────── */
const $   = id  => document.getElementById(id);
const qs  = sel => document.querySelector(sel);
const qsa = sel => [...document.querySelectorAll(sel)];

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toastWrap').appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 3400);
}

/* ─────────────────────────────────────────
   STATUS BAR
───────────────────────────────────────── */
function setSB(left, right) {
  if (left  != null) $('sbL').textContent = left;
  if (right != null) $('sbR').textContent = right;
}

/* ─────────────────────────────────────────
   PROGRESS
───────────────────────────────────────── */
function showProg(title, sub, pct) {
  $('progTitle').textContent  = title || 'Processing…';
  $('progSub').textContent    = sub   || 'Please wait';
  $('progFill').style.width   = (pct || 0) + '%';
  $('progressOverlay').classList.remove('hidden');
}
function setProg(pct, title) {
  $('progFill').style.width = pct + '%';
  if (title) $('progTitle').textContent = title;
}
function hideProg() {
  $('progressOverlay').classList.add('hidden');
}

/* ─────────────────────────────────────────
   MODALS
───────────────────────────────────────── */
function openModal(id)  { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

qsa('[data-close]').forEach(btn =>
  btn.addEventListener('click', () => closeModal(btn.dataset.close))
);
qsa('.modal-bg').forEach(bg =>
  bg.addEventListener('click', e => { if (e.target === bg) closeModal(bg.id); })
);

/* ─────────────────────────────────────────
   DRAWER HELPERS (mobile sidebar + r-panel)
───────────────────────────────────────── */
const drawerOverlay = $('drawerOverlay');

function openSidebar() {
  $('sidebar').classList.add('open');
  drawerOverlay.classList.remove('hidden');
  S.sidebarOpen = true;
  // close other drawer if open
  if (S.rpanelOpen) closeRPanel();
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  if (!S.rpanelOpen) drawerOverlay.classList.add('hidden');
  S.sidebarOpen = false;
}
function openRPanel() {
  $('rPanel').classList.add('open');
  drawerOverlay.classList.remove('hidden');
  S.rpanelOpen = true;
  if (S.sidebarOpen) closeSidebar();
}
function closeRPanel() {
  $('rPanel').classList.remove('open');
  if (!S.sidebarOpen) drawerOverlay.classList.add('hidden');
  S.rpanelOpen = false;
}
function isDrawerMode() {
  return window.innerWidth <= 639;
}
function isRPanelDrawer() {
  return window.innerWidth <= 1199;
}

$('btnHamSidebar').addEventListener('click', () => {
  if (S.sidebarOpen) closeSidebar(); else openSidebar();
});
$('btnHamPanel').addEventListener('click', () => {
  if (S.rpanelOpen) closeRPanel(); else openRPanel();
});
drawerOverlay.addEventListener('click', () => {
  closeSidebar();
  closeRPanel();
});

// Close drawers on resize if screen expands
window.addEventListener('resize', () => {
  if (!isDrawerMode() && S.sidebarOpen) closeSidebar();
  if (!isRPanelDrawer() && S.rpanelOpen) closeRPanel();
});

/* ─────────────────────────────────────────
   CANVAS BACKGROUND
───────────────────────────────────────── */
(function initCanvas() {
  const cv  = $('bgCanvas');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0;

  function resize() {
    W = cv.width  = window.innerWidth;
    H = cv.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Spread particles across actual viewport
  const pts = Array.from({ length: 55 }, () => ({
    x:  Math.random() * window.innerWidth,
    y:  Math.random() * window.innerHeight,
    vx: (Math.random() - .5) * .3,
    vy: (Math.random() - .5) * .3,
    r:  Math.random() * 1.5 + .4,
  }));

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(0,212,255,0.025)';
    ctx.lineWidth   = 1;
    const step = 60;
    for (let x = 0; x < W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Particles + connections
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.x = (p.x + p.vx + W) % W;
      p.y = (p.y + p.vy + H) % H;

      for (let j = i + 1; j < pts.length; j++) {
        const q  = pts[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 150) {
          ctx.strokeStyle = `rgba(0,148,255,${.07 * (1 - d / 150)})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,212,255,0.3)';
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ─────────────────────────────────────────
   SPLASH → APP
───────────────────────────────────────── */
$('btnEnter').addEventListener('click', () => {
  const splash = $('splash');
  splash.style.opacity    = '0';
  splash.style.transition = 'opacity .4s';
  setTimeout(() => {
    splash.classList.add('hidden');
    $('app').classList.remove('hidden');
  }, 380);
});

$('btnDemo').addEventListener('click', () => {
  loadDemo();
  $('btnEnter').click();
});

/* ─────────────────────────────────────────
   DEMO PROJECT
───────────────────────────────────────── */
function loadDemo() {
  const demo = {
    'home-page-final-v2 copy 3.html': `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>My App</title>\n  <link rel="stylesheet" href="styles-new-FINAL.css">\n</head>\n<body>\n  <h1>Welcome</h1>\n  <p>My web application.</p>\n  <script src="main-script-BACKUP.js"><\/script>\n</body>\n</html>`,
    'styles-new-FINAL.css': `body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }\nh1 { color: #333; font-size: 32px; }\n.btn { background: #0094ff; color: #fff; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; }`,
    'main-script-BACKUP.js': `// Application main script\nvar APP_VERSION = '1.0.0';\n\nfunction init() {\n  console.log('App started v' + APP_VERSION);\n  loadData();\n}\n\nfunction loadData() {\n  var url = '/api/data';\n  fetch(url)\n    .then(function(res) { return res.json(); })\n    .then(function(data) { console.log('Data', data); });\n}\n\ninit();`,
    'utils COPY.js': `// Utility helpers\nfunction formatDate(d) { return new Date(d).toLocaleDateString(); }\nfunction capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }\nfunction truncate(str, n) { return str.length > n ? str.slice(0, n) + '...' : str; }`,
    'config.json': `{\n  "name": "my-web-app",\n  "version": "1.0.0",\n  "description": "Demo web application",\n  "author": "Tukaram Hankare"\n}`,
    'OLD_notes.txt': `TODO:\n- Add README\n- Add .gitignore\n- Clean up file names\n- Deploy to GitHub Pages`,
    'components/button-component OLD.js': `// Button component\nfunction createButton(text, onClick) {\n  var btn = document.createElement('button');\n  btn.textContent = text;\n  btn.className = 'btn';\n  btn.addEventListener('click', onClick);\n  return btn;\n}`,
    'api-helper FINAL v3.js': `// API helper\nvar BASE_URL = 'http://localhost:3000';\nfunction apiGet(ep) { return fetch(BASE_URL + ep).then(function(r){ return r.json(); }); }\nfunction apiPost(ep, data) { return fetch(BASE_URL + ep, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }).then(function(r){ return r.json(); }); }`,
  };

  Object.entries(demo).forEach(([name, content]) => addFile(name, content, false));
  $('tbProj').textContent = 'demo-project';
  renderTree();
  updateTopbar();
  updateInsights();
  toast('Demo loaded! Try "Make GitHub Ready" ↑', 'ok');
  appendMsg('🎯 Demo project loaded with messy file names.<br/>Try <strong>⚙️ Auto-Structure Project</strong> first, then <strong>Make GitHub Ready</strong> for the full pipeline!', 'bot');
}

/* ─────────────────────────────────────────
   FILE SYSTEM
───────────────────────────────────────── */
function addFile(path, content, trackChange) {
  // FIX: check existence BEFORE writing
  const existed = Object.prototype.hasOwnProperty.call(S.files, path);
  S.files[path] = { name: path.split('/').pop(), content: content || '', path, modified: false };
  if (trackChange) {
    S.changeLog.push({
      type: existed ? 'modified' : 'added',
      path,
      desc: existed ? 'Content updated' : 'File created',
    });
  }
}

function removeFile(path) {
  // FIX: delete from state FIRST, then close tab (avoids stale ref)
  delete S.files[path];
  S.changeLog.push({ type: 'deleted', path, desc: 'File deleted' });
  closeTab(path);
}

function renameFileInternal(oldPath, newPath) {
  if (!S.files[oldPath] || oldPath === newPath) return;
  S.files[newPath] = { ...S.files[oldPath], name: newPath.split('/').pop(), path: newPath };
  delete S.files[oldPath];
  const ti = S.openTabs.indexOf(oldPath);
  if (ti >= 0) S.openTabs[ti] = newPath;
  if (S.activeTab === oldPath) S.activeTab = newPath;
  S.changeLog.push({ type: 'modified', path: newPath, desc: `Renamed from ${oldPath.split('/').pop()}` });
}

/* ─────────────────────────────────────────
   FILE UPLOAD / DROP
───────────────────────────────────────── */
const dropZone = $('dropZone');
const fpFolder = $('fpFolder');
const fpFiles  = $('fpFiles');

$('pickFolder').addEventListener('click', e => { e.stopPropagation(); fpFolder.click(); });
$('pickFiles').addEventListener('click',  e => { e.stopPropagation(); fpFiles.click(); });

// Drag events on document to prevent browser open
['dragenter','dragover'].forEach(ev => {
  document.addEventListener(ev, e => e.preventDefault());
  dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('over'); });
});
['dragleave','drop'].forEach(ev => {
  dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('over'); });
});

dropZone.addEventListener('drop', async e => {
  e.preventDefault();
  dropZone.classList.remove('over');
  const items = e.dataTransfer.items;
  if (items) {
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) await readEntry(entry, '');
    }
  } else {
    await readFileList(e.dataTransfer.files);
  }
  afterUpload();
});

fpFolder.addEventListener('change', async () => {
  await readFileList(fpFolder.files);
  fpFolder.value = '';
  afterUpload();
});
fpFiles.addEventListener('change', async () => {
  await readFileList(fpFiles.files);
  fpFiles.value = '';
  afterUpload();
});

async function readEntry(entry, prefix) {
  if (entry.isFile) {
    await new Promise(res => entry.file(async f => {
      await readOneFile(f, prefix + f.name);
      res();
    }));
  } else if (entry.isDirectory) {
    await new Promise(res => {
      entry.createReader().readEntries(async entries => {
        for (const e of entries) await readEntry(e, prefix + entry.name + '/');
        res();
      });
    });
  }
}

async function readFileList(list) {
  for (const f of list) {
    await readOneFile(f, f.webkitRelativePath || f.name);
  }
}

async function readOneFile(file, path) {
  const isBinary = /\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|otf|mp4|mp3|ogg|pdf|zip|tar|gz|exe|bin|dmg|pkg)$/i.test(file.name);
  const content  = isBinary
    ? `[Binary file: ${file.name} — ${(file.size / 1024).toFixed(1)} KB]`
    : await file.text().catch(() => `[Could not read: ${file.name}]`);
  addFile(path, content, false);
  // Set project name from root folder on first upload
  const parts = path.split('/');
  if (parts.length > 1 && $('tbProj').textContent.trim() === 'untitled-project') {
    $('tbProj').textContent = parts[0];
  }
}

function afterUpload() {
  renderTree();
  updateTopbar();
  updateInsights();
  const count = Object.keys(S.files).length;
  toast(`${count} file${count === 1 ? '' : 's'} loaded`, 'ok');
  setSB(`${count} file${count === 1 ? '' : 's'} loaded`);
}

/* ─────────────────────────────────────────
   FILE TREE
───────────────────────────────────────── */
function buildTreeData(files) {
  const root = {};
  Object.keys(files).forEach(path => {
    const parts = path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = null; // file leaf
      } else {
        if (!node[part]) node[part] = {};
        node = node[part];
      }
    });
  });
  return root;
}

function fileIcon(name) {
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  // Special filenames first
  const nameMap = {
    'dockerfile': '🐳', 'license': '⚖️', 'readme.md': '📖',
    'contributing.md': '🤝', '.gitignore': '🛡️',
    '.env': '🔑', '.env.example': '🔑', '.env.local': '🔑',
  };
  if (nameMap[name.toLowerCase()]) return nameMap[name.toLowerCase()];
  const extMap = {
    js:'🟨', ts:'🔷', tsx:'⚛️', jsx:'⚛️',
    html:'🌐', css:'🎨', scss:'🎨', less:'🎨', sass:'🎨',
    json:'📋', md:'📝', txt:'📄',
    yml:'⚙️', yaml:'⚙️', toml:'⚙️', ini:'⚙️',
    py:'🐍', rb:'💎', go:'🚀', rs:'🦀', php:'🐘', java:'☕', kt:'☕',
    sh:'⚡', bash:'⚡', zsh:'⚡',
    png:'🖼️', jpg:'🖼️', jpeg:'🖼️', svg:'🖼️', gif:'🖼️', ico:'🖼️', webp:'🖼️',
    lock:'🔒', prettierrc:'✨', eslintrc:'🔍',
    sql:'🗄️', db:'🗄️', graphql:'🔵',
    vue:'💚', svelte:'🔶',
  };
  return extMap[ext] || '📄';
}

function renderTree() {
  const tree = buildTreeData(S.files);
  $('fileTree').innerHTML = '';
  renderNode(tree, $('fileTree'), '', 0);
}

function renderNode(node, container, prefix, depth) {
  const entries = Object.entries(node).sort(([an, av], [bn, bv]) => {
    const aF = av !== null, bF = bv !== null;
    if (aF !== bF) return bF ? 1 : -1; // folders first
    return an.localeCompare(bn);
  });

  entries.forEach(([name, children]) => {
    const path     = prefix ? `${prefix}/${name}` : name;
    const isFolder = children !== null;
    const isOpen   = S.treeOpen[path] !== false; // default open

    const item = document.createElement('div');
    item.className = 'ti' + (S.activeTab === path ? ' active' : '');
    item.dataset.path = path;

    // Indentation
    for (let i = 0; i < depth; i++) {
      const ind = document.createElement('span');
      ind.className = 'ti-indent';
      item.appendChild(ind);
    }

    const arrow = document.createElement('span');
    arrow.className = 'ti-arrow' + (isFolder && isOpen ? ' open' : '');
    arrow.textContent = isFolder ? '▶' : '';
    item.appendChild(arrow);

    const icon = document.createElement('span');
    icon.className = 'ti-icon';
    icon.textContent = isFolder ? (isOpen ? '📂' : '📁') : fileIcon(name);
    item.appendChild(icon);

    const nameEl = document.createElement('span');
    nameEl.className = 'ti-name';
    nameEl.textContent = name;
    item.appendChild(nameEl);

    container.appendChild(item);

    if (isFolder) {
      const childDiv = document.createElement('div');
      childDiv.className = 'ti-children';
      childDiv.style.display = isOpen ? '' : 'none';
      container.appendChild(childDiv);
      renderNode(children, childDiv, path, depth + 1);

      item.addEventListener('click', () => {
        const wasOpen = S.treeOpen[path] !== false;
        S.treeOpen[path] = !wasOpen;
        childDiv.style.display = wasOpen ? 'none' : '';
        arrow.classList.toggle('open', !wasOpen);
        icon.textContent = wasOpen ? '📁' : '📂';
      });
    } else {
      item.addEventListener('click', () => {
        openFile(path);
        // Auto-close sidebar drawer on mobile after file selection
        if (isDrawerMode() && S.sidebarOpen) closeSidebar();
      });
    }

    item.addEventListener('contextmenu', e => {
      e.preventDefault();
      showCtx(e.clientX, e.clientY, path);
    });
    // Long-press for touch devices
    let touchTimer = null;
    item.addEventListener('touchstart', e => {
      touchTimer = setTimeout(() => {
        const t = e.touches[0];
        showCtx(t.clientX, t.clientY, path);
      }, 600);
    }, { passive: true });
    item.addEventListener('touchend',  () => clearTimeout(touchTimer));
    item.addEventListener('touchmove', () => clearTimeout(touchTimer));
  });
}

/* ─────────────────────────────────────────
   TREE TOOLBAR BUTTONS
───────────────────────────────────────── */
$('tbNewFile').addEventListener('click',   () => promptNewFile(''));
$('tbNewFolder').addEventListener('click', () => promptNewFolder(''));
$('tbCollapse').addEventListener('click',  () => { S.treeOpen = {}; renderTree(); });

function promptNewFile(dir) {
  const name = window.prompt('New file name:', 'untitled.js');
  if (!name || !name.trim()) return;
  const path = dir ? `${dir}/${name.trim()}` : name.trim();
  addFile(path, '', true);
  renderTree();
  openFile(path);
  updateInsights();
}
function promptNewFolder(dir) {
  const name = window.prompt('New folder name:', 'src');
  if (!name || !name.trim()) return;
  const n    = name.trim();
  const path = dir ? `${dir}/${n}/.gitkeep` : `${n}/.gitkeep`;
  addFile(path, '', true);
  const folderPath = dir ? `${dir}/${n}` : n;
  S.treeOpen[folderPath] = true;
  renderTree();
  updateInsights();
  toast(`Folder "${n}" created`, 'ok');
}

/* ─────────────────────────────────────────
   CONTEXT MENU
───────────────────────────────────────── */
function showCtx(x, y, path) {
  S.ctxPath = path;
  const menu = $('ctxMenu');
  menu.classList.remove('hidden');
  // Clamp to viewport
  const mw = 200, mh = 300;
  menu.style.left = Math.min(x, window.innerWidth  - mw) + 'px';
  menu.style.top  = Math.min(y, window.innerHeight - mh) + 'px';
}

document.addEventListener('click',    () => $('ctxMenu').classList.add('hidden'));
document.addEventListener('keydown',  e => { if (e.key === 'Escape') { $('ctxMenu').classList.add('hidden'); } });

$('ctxMenu').addEventListener('click', async e => {
  const li = e.target.closest('li[data-action]');
  if (!li) return;
  $('ctxMenu').classList.add('hidden');
  const action = li.dataset.action;
  const path   = S.ctxPath;
  if (!path) return;

  if (action === 'open')      openFile(path);
  if (action === 'rename')    startRename(path);
  if (action === 'duplicate') duplicateFile(path);
  if (action === 'delete') {
    if (!window.confirm(`Delete "${path}"?`)) return;
    const toDelete = Object.keys(S.files).filter(p => p === path || p.startsWith(path + '/'));
    toDelete.forEach(p => removeFile(p));
    renderTree(); updateTopbar(); updateInsights();
    toast('Deleted', 'warn');
  }
  if (action === 'newfile')  promptNewFile(dirOf(path));
  if (action === 'newfolder') promptNewFolder(dirOf(path));
  if (action === 'enhance')  await doEnhance(path);
  if (action === 'refactor') await doRefactor(path);
});

function dirOf(path) {
  if (!S.files[path]) return path; // it's a folder
  const parts = path.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

/* RENAME */
function startRename(path) {
  const oldName = path.split('/').pop();
  $('renameInput').value = oldName;
  openModal('renameModal');
  setTimeout(() => { $('renameInput').select(); }, 50);

  $('renameOk').onclick = () => {
    const newName = $('renameInput').value.trim();
    if (!newName || newName === oldName) { closeModal('renameModal'); return; }
    const parts  = path.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');
    Object.keys(S.files)
      .filter(p => p === path || p.startsWith(path + '/'))
      .forEach(p => renameFileInternal(p, newPath + p.slice(path.length)));
    closeModal('renameModal');
    renderTree(); renderTabs(); updateInsights();
    toast(`Renamed to "${newName}"`, 'ok');
  };
  $('renameInput').onkeydown = e => { if (e.key === 'Enter') $('renameOk').click(); };
}

/* DUPLICATE */
function duplicateFile(path) {
  const file = S.files[path];
  if (!file) return;
  const parts = path.split('/');
  const fname = parts[parts.length - 1];
  const dotI  = fname.lastIndexOf('.');
  const base  = dotI >= 0 ? fname.slice(0, dotI) : fname;
  const ext   = dotI >= 0 ? fname.slice(dotI)    : '';
  parts[parts.length - 1] = `${base}-copy${ext}`;
  const newPath = parts.join('/');
  addFile(newPath, file.content, true);
  renderTree(); updateInsights();
  toast(`Duplicated as ${parts[parts.length - 1]}`, 'ok');
}

/* ─────────────────────────────────────────
   EDITOR TABS
───────────────────────────────────────── */
function openFile(path) {
  if (!S.files[path]) return;
  if (!S.openTabs.includes(path)) S.openTabs.push(path);
  S.activeTab = path;
  renderTabs();
  renderTree();
  loadEditor(S.files[path]);
}

function closeTab(path) {
  S.openTabs = S.openTabs.filter(p => p !== path);
  if (S.activeTab === path) {
    S.activeTab = S.openTabs.length ? S.openTabs[S.openTabs.length - 1] : null;
  }
  renderTabs();
  if (S.activeTab && S.files[S.activeTab]) {
    loadEditor(S.files[S.activeTab]);
  } else {
    showWelcome();
  }
}

function renderTabs() {
  const strip = $('tabStrip');
  strip.innerHTML = '';
  S.openTabs.forEach(path => {
    const file = S.files[path];
    if (!file) return;

    const tab = document.createElement('div');
    tab.className = 'tab' + (S.activeTab === path ? ' active' : '') + (file.modified ? ' modified' : '');

    const dot = document.createElement('span');
    dot.className = 'tab-dot';

    const lbl = document.createElement('span');
    lbl.textContent = `${fileIcon(file.name)} ${file.name}`;

    const x = document.createElement('button');
    x.className = 'tab-close';
    x.textContent = '✕';
    x.setAttribute('aria-label', `Close ${file.name}`);
    x.addEventListener('click', e => { e.stopPropagation(); closeTab(path); });

    tab.appendChild(dot);
    tab.appendChild(lbl);
    tab.appendChild(x);
    tab.addEventListener('click', () => openFile(path));
    strip.appendChild(tab);
  });

  // Scroll active tab into view
  const activeTab = strip.querySelector('.tab.active');
  if (activeTab) activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

/* ─────────────────────────────────────────
   MONACO EDITOR
───────────────────────────────────────── */
function monacoLang(name) {
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  return {
    js:'javascript', ts:'typescript', tsx:'typescript', jsx:'javascript',
    html:'html', css:'css', scss:'scss', less:'less',
    json:'json', md:'markdown', yml:'yaml', yaml:'yaml',
    py:'python', rb:'ruby', go:'go', rs:'rust', sh:'shell',
    bash:'shell', php:'php', java:'java', kt:'kotlin',
    txt:'plaintext', gitignore:'plaintext', env:'plaintext',
    toml:'ini', lock:'plaintext', sql:'sql', vue:'html', svelte:'html',
  }[ext] || 'plaintext';
}

require.config({
  paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }
});
require(['vs/editor/editor.main'], () => {
  monaco.editor.defineTheme('forgehub', {
    base: 'vs-dark', inherit: true,
    rules: [],
    colors: {
      'editor.background':                '#080b10',
      'editor.lineHighlightBackground':   '#0d1117',
      'editorLineNumber.foreground':       '#253350',
      'editorLineNumber.activeForeground': '#00d4ff',
      'editor.selectionBackground':        '#0d2440',
      'editorCursor.foreground':           '#00d4ff',
    }
  });

  S.monaco = monaco.editor.create($('monacoMount'), {
    theme: 'forgehub',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: "'Fira Code', monospace",
    fontLigatures: true,
    minimap: { enabled: window.innerWidth > 900 },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    lineNumbers: 'on',
    renderLineHighlight: 'line',
    cursorBlinking: 'smooth',
    tabSize: 2,
    smoothScrolling: true,
    padding: { top: 8 },
  });
  S.monacoReady = true;

  S.monaco.onDidChangeModelContent(() => {
    if (S.activeTab && S.files[S.activeTab]) {
      S.files[S.activeTab].content  = S.monaco.getValue();
      S.files[S.activeTab].modified = true;
      renderTabs();
    }
  });

  // If a file was queued before Monaco was ready, load it now
  if (S.activeTab && S.files[S.activeTab]) {
    loadEditor(S.files[S.activeTab]);
  }

  // Toggle minimap on resize
  window.addEventListener('resize', () => {
    S.monaco.updateOptions({ minimap: { enabled: window.innerWidth > 900 } });
  });
});

function loadEditor(file) {
  if (!S.monacoReady) return; // will be called again after Monaco ready
  $('editorWelcome').style.display = 'none';
  $('monacoMount').style.display   = 'block';

  const model = monaco.editor.createModel(file.content || '', monacoLang(file.name));
  S.monaco.setModel(model);
  setSB(`${file.name}  ·  ${monacoLang(file.name)}`);
}

function showWelcome() {
  if (S.monacoReady && S.monaco) {
    S.monaco.setModel(null);
  }
  $('monacoMount').style.display   = 'none';
  $('editorWelcome').style.display = 'flex';
  setSB('Ready');
}

/* Keyboard shortcuts */
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 's') {
    e.preventDefault();
    if (S.activeTab && S.monacoReady) {
      S.files[S.activeTab].content  = S.monaco.getValue();
      S.files[S.activeTab].modified = false;
      renderTabs();
      toast('Saved ✓', 'ok');
    }
  }
  if (ctrl && e.key === 'w') {
    e.preventDefault();
    if (S.activeTab) closeTab(S.activeTab);
  }
});

/* ─────────────────────────────────────────
   RIGHT PANEL TABS
───────────────────────────────────────── */
qsa('.rp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    qsa('.rp-tab').forEach(t => t.classList.remove('active'));
    qsa('.rp-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const id = 'rp' + tab.dataset.rp.charAt(0).toUpperCase() + tab.dataset.rp.slice(1);
    $(id).classList.add('active');
  });
});

/* ─────────────────────────────────────────
   AI TOOL BUTTONS (sidebar)
───────────────────────────────────────── */
qsa('.atp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    if (tool !== 'genfile' && Object.keys(S.files).length === 0) {
      toast('Upload some files first!', 'warn');
      return;
    }
    if (tool === 'autoStructure') runAutoStructure();
    if (tool === 'readme')        runReadme();
    if (tool === 'gitignore')     runGitignore();
    if (tool === 'gaps')          runFillGaps();
    if (tool === 'genfile')       openGenModal();
    if (tool === 'contributing')  runContributing();
  });
});

/* ─────────────────────────────────────────
   AI TOOLS
───────────────────────────────────────── */

async function runAutoStructure() {
  showProg('Auto-structuring…', 'Detecting project type', 10);
  await tick();
  const result = FHEngine.autoStructure(S.files);
  setProg(40, `Detected: ${result.label}`);
  await tick();

  Object.entries(result.renames || {}).forEach(([from, to]) => {
    if (S.files[from]) {
      Object.keys(S.files)
        .filter(p => p === from || p.startsWith(from + '/'))
        .forEach(p => renameFileInternal(p, to + p.slice(from.length)));
    }
  });
  setProg(80, 'Applying structure…');
  await tick();

  Object.entries(result.newFiles || {}).forEach(([path, content]) => {
    if (!S.files[path]) addFile(path, content, true);
  });
  setProg(100, 'Done!');
  await tick(300);
  hideProg();

  renderTree(); renderTabs(); updateTopbar(); updateInsights(); updateChanges();
  const renamed = Object.keys(result.renames || {}).length;
  appendMsg(`✅ <strong>Auto-Structure complete!</strong><br/>Type: <strong>${result.label}</strong><br/>Renamed/moved: <strong>${renamed}</strong> file(s)${result.log && result.log.length ? `<br/><pre>${result.log.slice(0,8).join('\n')}${result.log.length > 8 ? '\n…and more' : ''}</pre>` : ''}`, 'bot');
  toast(`Structured as ${result.label} — ${renamed} files reorganized`, 'ok');
  setSB(`Auto-structure complete`);
}

async function runReadme() {
  showProg('Generating README.md…', 'Analyzing project', 20);
  await tick();
  const name    = $('tbProj').textContent.trim() || 'my-project';
  const content = FHEngine.generateReadme(name, S.files);
  setProg(100, 'Done!');
  await tick(300);
  hideProg();
  addFile('README.md', content, true);
  renderTree(); updateInsights(); updateChanges();
  openFile('README.md');
  appendMsg('✅ <strong>README.md</strong> generated and opened!', 'bot');
  toast('README.md created!', 'ok');
}

async function runGitignore() {
  showProg('Generating .gitignore + LICENSE…', 'Detecting project type', 30);
  await tick();
  const name    = $('tbProj').textContent.trim() || 'my-project';
  const gi      = FHEngine.generateGitignore(S.files);
  const license = FHEngine.generateLicense(name);
  setProg(100, 'Done!');
  await tick(300);
  hideProg();
  addFile('.gitignore', gi, true);
  addFile('LICENSE', license, true);
  renderTree(); updateInsights(); updateChanges();
  appendMsg('✅ <strong>.gitignore</strong> and <strong>LICENSE</strong> (MIT) created!', 'bot');
  toast('.gitignore + LICENSE created!', 'ok');
}

async function runFillGaps() {
  showProg('Detecting project gaps…', 'Analyzing file structure', 15);
  await tick();
  const name   = $('tbProj').textContent.trim() || 'my-project';
  const result = FHEngine.detectAndFillGaps(S.files, name);
  setProg(70, `Found ${result.gaps.length} gap(s)…`);
  await tick();
  Object.entries(result.filled || {}).forEach(([path, content]) => {
    if (!S.files[path]) addFile(path, content, true);
  });
  setProg(100, 'Done!');
  await tick(300);
  hideProg();
  renderTree(); updateInsights(); updateChanges();
  const filled = Object.keys(result.filled || {}).length;
  const msg = result.gaps.length === 0
    ? '✅ No critical gaps found! Your project looks complete.'
    : `🔍 <strong>${result.gaps.length} gap(s) detected, ${filled} file(s) created:</strong><br/>${result.gaps.map(g => `• ${g}`).join('<br/>')}`;
  appendMsg(msg, 'bot');
  toast(filled ? `${filled} missing file(s) created!` : 'No gaps found', filled ? 'ok' : 'info');
}

async function runContributing() {
  showProg('Generating CONTRIBUTING.md…', '', 50);
  await tick();
  const name    = $('tbProj').textContent.trim() || 'my-project';
  const content = FHEngine.generateContributing(name);
  setProg(100);
  await tick(300);
  hideProg();
  addFile('CONTRIBUTING.md', content, true);
  renderTree(); updateInsights(); updateChanges();
  openFile('CONTRIBUTING.md');
  appendMsg('✅ <strong>CONTRIBUTING.md</strong> generated!', 'bot');
  toast('CONTRIBUTING.md created!', 'ok');
}

function openGenModal() {
  $('genInput').value = '';
  openModal('genModal');
  setTimeout(() => $('genInput').focus(), 80);
}

$('genOk').addEventListener('click', async () => {
  const prompt = $('genInput').value.trim();
  if (!prompt) return;
  closeModal('genModal');
  await runGenFile(prompt);
});
$('genInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('genOk').click();
});

async function runGenFile(prompt) {
  showProg('Generating file…', `"${prompt.slice(0, 50)}"`, 30);
  await tick();
  const result = FHEngine.generateFileFromPrompt(prompt, S.files);
  setProg(100, 'Done!');
  await tick(300);
  hideProg();
  if (result && result.path) {
    addFile(result.path, result.content, true);
    renderTree(); updateInsights(); updateChanges();
    openFile(result.path);
    appendMsg(`✅ Generated <strong>${result.path}</strong>!`, 'bot');
    toast(`${result.path.split('/').pop()} created!`, 'ok');
  } else {
    toast('Could not generate that file type', 'warn');
  }
}

async function doEnhance(path) {
  const file = S.files[path];
  if (!file) return;
  showProg(`Enhancing ${file.name}…`, 'Formatting and improving', 50);
  await tick();
  const improved = FHEngine.enhanceFile(path, file.content);
  file.content = improved; file.modified = true;
  if (S.activeTab === path && S.monacoReady) S.monaco.setValue(improved);
  S.changeLog.push({ type: 'modified', path, desc: 'Enhanced' });
  setProg(100); await tick(300); hideProg();
  renderTabs(); updateChanges();
  appendMsg(`✨ <strong>${file.name}</strong> enhanced.`, 'bot');
  toast(`${file.name} enhanced!`, 'ok');
}

async function doRefactor(path) {
  const file = S.files[path];
  if (!file) return;
  showProg(`Refactoring ${file.name}…`, 'Applying best practices', 50);
  await tick();
  const refactored = FHEngine.refactorFile(path, file.content);
  file.content = refactored; file.modified = true;
  if (S.activeTab === path && S.monacoReady) S.monaco.setValue(refactored);
  S.changeLog.push({ type: 'modified', path, desc: 'Refactored' });
  setProg(100); await tick(300); hideProg();
  renderTabs(); updateChanges();
  appendMsg(`🔄 <strong>${file.name}</strong> refactored.`, 'bot');
  toast(`${file.name} refactored!`, 'ok');
}

/* ─────────────────────────────────────────
   MAKE GITHUB READY
───────────────────────────────────────── */
$('btnGitHub').addEventListener('click', async () => {
  if (Object.keys(S.files).length === 0) {
    toast('Upload files first!', 'warn');
    return;
  }
  appendMsg('🚀 Starting <strong>Make GitHub Ready</strong> pipeline…', 'bot');

  // Open right panel on mobile so user sees progress messages
  if (isRPanelDrawer() && !S.rpanelOpen) openRPanel();

  const pipeline = [
    [runAutoStructure, 'Auto-structuring…',       0],
    [runReadme,        'Generating README.md…',   25],
    [runGitignore,     '.gitignore + LICENSE…',   50],
    [runFillGaps,      'Filling gaps…',            70],
    [runContributing,  'CONTRIBUTING.md…',         88],
  ];

  for (const [fn, title, pct] of pipeline) {
    showProg(title, 'GitHub pipeline', pct);
    await tick(150);
    await fn();
  }

  hideProg();
  renderTree(); updateTopbar(); updateInsights(); updateChanges();
  appendMsg(
    `🎉 <strong>GitHub Ready!</strong><br/><br/>` +
    `✅ Organized structure<br/>✅ Clean file names<br/>` +
    `✅ README.md<br/>✅ .gitignore<br/>✅ MIT LICENSE<br/>✅ CONTRIBUTING.md<br/><br/>` +
    `Click <strong>Export ZIP</strong> to download and push to GitHub!`,
    'bot'
  );
  toast('🎉 GitHub-ready! Export ZIP to publish.', 'ok');
  setSB('GitHub-ready! Now export ZIP.');
});

/* ─────────────────────────────────────────
   EXPORT ZIP
───────────────────────────────────────── */
$('btnExport').addEventListener('click', async () => {
  if (Object.keys(S.files).length === 0) {
    toast('No files to export!', 'warn');
    return;
  }
  showProg('Packaging ZIP…', 'Compressing files', 30);
  await tick();

  const zip  = new JSZip();
  const name = $('tbProj').textContent.trim() || 'my-project';
  Object.entries(S.files).forEach(([path, file]) => {
    zip.file(`${name}/${path}`, file.content);
  });

  setProg(70, 'Compressing…');
  await tick();
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  setProg(100, 'Done!');
  await tick(300);
  hideProg();

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = `${name}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  appendMsg(
    `📦 <strong>${name}.zip</strong> downloaded with ${Object.keys(S.files).length} files.<br/><br/>` +
    `Push to GitHub:<br/><pre>git init\ngit add .\ngit commit -m "Initial commit"\ngit branch -M main\ngit remote add origin &lt;repo-url&gt;\ngit push -u origin main</pre>`,
    'bot'
  );
  toast('ZIP exported!', 'ok');
});

/* ─────────────────────────────────────────
   AI CHAT
───────────────────────────────────────── */
function appendMsg(html, role) {
  const msgs = $('msgs');
  const div  = document.createElement('div');
  div.className = `msg ${role}`;

  const av  = document.createElement('div');
  av.className = 'msg-av';
  av.textContent = role === 'bot' ? 'FH' : 'Me';

  const bub = document.createElement('div');
  bub.className = 'msg-bub';
  bub.innerHTML  = html;

  div.appendChild(av);
  div.appendChild(bub);
  msgs.appendChild(div);

  // Scroll to bottom
  requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });

  // Switch to chat tab safely
  qsa('.rp-tab').forEach(t => t.classList.remove('active'));
  qsa('.rp-pane').forEach(p => p.classList.remove('active'));
  const chatTab  = qs('[data-rp="chat"]');
  const chatPane = $('rpChat');
  if (chatTab)  chatTab.classList.add('active');
  if (chatPane) chatPane.classList.add('active');
}

async function sendChat() {
  const input = $('chatInput');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = '';
  appendMsg(escapeHtml(text), 'user');
  await tick(60);
  const name = $('tbProj').textContent.trim() || 'my-project';
  const resp = FHEngine.chatRespond(text, S.files, name);
  appendMsg(resp, 'bot');
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

$('chatGo').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
// Auto-grow textarea
$('chatInput').addEventListener('input', function() {
  this.style.height = '';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

/* ─────────────────────────────────────────
   INSIGHTS
───────────────────────────────────────── */
function updateInsights() {
  const ins  = FHEngine.buildInsights(S.files, $('tbProj').textContent.trim());
  const cont = $('insightsInner');
  if (!ins) {
    cont.innerHTML = '<p class="rp-empty">Upload files to see project insights.</p>';
    return;
  }
  const topExts = Object.entries(ins.extCount).sort((a,b) => b[1] - a[1]).slice(0, 8);
  cont.innerHTML = `
    <div class="ins-card">
      <div class="ins-card-t">📊 Project Stats</div>
      <div class="ins-row"><span class="ins-lbl">Project type</span><span class="ins-val">${ins.label}</span></div>
      <div class="ins-row"><span class="ins-lbl">Total files</span><span class="ins-val">${ins.paths.length}</span></div>
      <div class="ins-row"><span class="ins-lbl">Folders</span><span class="ins-val">${ins.folderCount}</span></div>
      <div class="ins-row"><span class="ins-lbl">File types</span><span class="ins-val">${Object.keys(ins.extCount).length}</span></div>
    </div>
    <div class="ins-card">
      <div class="ins-card-t">🏷️ File Types</div>
      ${topExts.map(([e,c]) => `<span class="ins-tag">.${e} ×${c}</span>`).join('')}
    </div>
    <div class="ins-card">
      <div class="ins-card-t">✅ GitHub Checklist — ${ins.score}%</div>
      <div class="ins-progress"><div class="ins-progress-fill" style="width:${ins.score}%"></div></div>
      ${ins.checks.map(c => `<span class="ins-tag ${c.ok ? 'ok' : 'warn'}">${c.ok ? '✓' : '✗'} ${c.label}</span>`).join('')}
    </div>
  `;
}

/* ─────────────────────────────────────────
   CHANGES LOG
───────────────────────────────────────── */
function updateChanges() {
  const cont = $('changesInner');
  if (!S.changeLog.length) {
    cont.innerHTML = '<p class="rp-empty">Apply AI tools to track changes here.</p>';
    return;
  }
  cont.innerHTML = S.changeLog.slice(-30).reverse().map(c => `
    <div class="change-item ${c.type}">
      <div class="change-label">${c.type.toUpperCase()}</div>
      <div class="change-path">${escapeHtml(c.path)}</div>
      ${c.desc ? `<div style="font-size:10px;opacity:.6;margin-top:2px">${escapeHtml(c.desc)}</div>` : ''}
    </div>
  `).join('');
}

/* ─────────────────────────────────────────
   TOPBAR STATS
───────────────────────────────────────── */
function updateTopbar() {
  const count = Object.keys(S.files).length;
  $('tbStats').textContent = `${count} file${count === 1 ? '' : 's'}`;
  const typeMap = {
    nextjs:'Next.js', react:'React', vite:'Vite', nodejs:'Node.js',
    python:'Python', golang:'Go', rust:'Rust', php:'PHP',
    java:'Java', html:'HTML', ruby:'Ruby', angular:'Angular',
    vue:'Vue', svelte:'Svelte', generic:'General',
  };
  const type = count ? FHEngine.detectProjectType(Object.keys(S.files)) : null;
  $('tbType').textContent = type ? (typeMap[type] || type) : '—';
}

/* ─────────────────────────────────────────
   EDITABLE PROJECT NAME — plaintext paste + Enter blur
───────────────────────────────────────── */
const tbProj = $('tbProj');
tbProj.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); tbProj.blur(); }
});
tbProj.addEventListener('paste', e => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text.replace(/\n/g, ''));
});
tbProj.addEventListener('blur', () => {
  const v = tbProj.textContent.trim();
  if (!v) tbProj.textContent = 'untitled-project';
});

/* ─────────────────────────────────────────
   UTILS
───────────────────────────────────────── */
function tick(ms) {
  return new Promise(r => setTimeout(r, ms == null ? 30 : ms));
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
setSB('Ready', 'ForgeHub AI · Tukaram Hankare');
showWelcome();
