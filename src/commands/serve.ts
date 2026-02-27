import http from 'http';
import { exec } from 'child_process';
import {
    getBugs,
    getBugById,
    saveBug,
    deleteBug,
    addBug,
    getTags,
    generateId,
    sanitizeInput,
    ensureProjectInit,
    Bug,
    BugComment,
} from '../utils/storage';

// ---------------------------------------------------------------------------
// Embedded HTML frontend
// ---------------------------------------------------------------------------

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bugbook</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#e6edf3;height:100vh;display:flex;flex-direction:column;font-size:14px}
a{color:#58a6ff;text-decoration:none}
a:hover{text-decoration:underline}
button{cursor:pointer;border:none;border-radius:6px;padding:5px 12px;font-size:13px;transition:background .15s}
input,textarea,select{background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:6px 10px;font-size:13px;font-family:inherit;width:100%}
input:focus,textarea:focus,select:focus{outline:none;border-color:#58a6ff}
select option{background:#161b22}

/* Error banner */
#error-banner{display:none;background:#3a1a1a;border-bottom:1px solid #f85149;color:#f85149;padding:8px 16px;font-size:13px;flex-shrink:0}
#error-banner.visible{display:block}

/* Header */
#header{background:#161b22;border-bottom:1px solid #30363d;padding:10px 16px;display:flex;align-items:center;gap:16px;flex-shrink:0}
#header h1{font-size:18px;font-weight:700;color:#e6edf3;letter-spacing:-.3px}
.stat-badge{background:#21262d;border:1px solid #30363d;border-radius:20px;padding:2px 10px;font-size:12px;color:#8b949e}
.stat-badge span{color:#e6edf3;font-weight:600}
#header-right{margin-left:auto}
#btn-new{background:#238636;color:#fff;font-weight:600;padding:6px 14px;border:none;border-radius:6px;cursor:pointer}
#btn-new:hover{background:#2ea043}

/* Layout */
#layout{display:flex;flex:1;overflow:hidden}

/* Left panel */
#left{width:280px;flex-shrink:0;border-right:1px solid #30363d;display:flex;flex-direction:column;overflow:hidden}
#search-bar{padding:10px;border-bottom:1px solid #30363d}
#search-input{background:#0d1117;border-color:#30363d}
#filter-bar{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid #30363d}
.filter-btn{background:none;border:1px solid #30363d;color:#8b949e;padding:3px 10px;font-size:12px;border-radius:20px;cursor:pointer}
.filter-btn.active,.filter-btn:hover{background:#21262d;color:#e6edf3;border-color:#58a6ff}
#bug-list{flex:1;overflow-y:auto}
.bug-item{padding:10px 12px;border-bottom:1px solid #21262d;cursor:pointer;transition:background .1s;user-select:none}
.bug-item:hover{background:#161b22}
.bug-item.selected{background:#1f2937;border-left:3px solid #58a6ff}
.bug-item-id{font-size:11px;color:#8b949e;font-family:monospace}
.bug-item-error{font-size:13px;color:#e6edf3;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bug-item-meta{display:flex;gap:6px;margin-top:4px;align-items:center}
.badge{font-size:11px;border-radius:4px;padding:1px 6px;font-weight:600}
.badge-open{background:#1a3a2a;color:#3fb950}
.badge-resolved{background:#1a2333;color:#58a6ff}
.badge-high{background:#3a1a1a;color:#f85149}
.badge-medium{background:#3a2e1a;color:#d29922}
.badge-low{background:#1a2a3a;color:#58a6ff}
.overdue-dot{width:7px;height:7px;border-radius:50%;background:#f85149;display:inline-block}

/* Right panel */
#right{flex:1;overflow-y:auto;padding:20px}
#empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#8b949e;gap:10px}
#empty-state h2{color:#e6edf3;font-size:18px}

/* Detail */
#detail{max-width:760px;display:none}
.detail-header{display:flex;align-items:flex-start;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.detail-id{font-family:monospace;font-size:15px;color:#8b949e}
.detail-badges{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}
.detail-actions{margin-left:auto;display:flex;gap:6px;flex-shrink:0}
.btn-edit{background:#21262d;color:#e6edf3;border:1px solid #30363d}
.btn-edit:hover{background:#30363d}
.btn-resolve{background:#1f4b2e;color:#3fb950;border:1px solid #2ea043}
.btn-resolve:hover{background:#2ea043;color:#fff}
.btn-unresolve{background:#1a2333;color:#58a6ff;border:1px solid #1f6feb}
.btn-unresolve:hover{background:#1f6feb;color:#fff}
.btn-delete{background:#3a1a1a;color:#f85149;border:1px solid #f85149}
.btn-delete:hover{background:#f85149;color:#fff}
.detail-section{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:14px;margin-bottom:12px}
.detail-label{font-size:11px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.detail-value{color:#e6edf3;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.detail-grid .detail-section{margin-bottom:0}
.files-list{list-style:none}
.files-list li{font-family:monospace;font-size:12px;color:#58a6ff;padding:2px 0}
.comment{border-left:3px solid #30363d;padding:6px 10px;margin-bottom:8px}
.comment.gh{border-left-color:#6e40c9}
.comment-meta{font-size:11px;color:#8b949e;margin-bottom:3px}
.comment-text{color:#e6edf3;line-height:1.4;white-space:pre-wrap;word-break:break-word}
.comment-input-row{display:flex;gap:8px;margin-top:8px}
.comment-input-row input{flex:1}
.btn-comment{background:#238636;color:#fff;white-space:nowrap;flex-shrink:0}
.btn-comment:hover{background:#2ea043}
.github-section{background:#0e1a2f;border:1px solid #1f4b99;border-radius:8px;padding:12px;margin-bottom:12px}
.github-section .detail-label{color:#58a6ff}

/* Custom confirm overlay */
#confirm-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.65);z-index:150;align-items:center;justify-content:center}
#confirm-overlay.visible{display:flex}
#confirm-box{background:#161b22;border:1px solid #f85149;border-radius:10px;padding:24px;width:360px;max-width:90vw}
#confirm-box p{color:#e6edf3;margin-bottom:18px;line-height:1.5}
#confirm-box .confirm-actions{display:flex;justify-content:flex-end;gap:8px}
#confirm-cancel{background:#21262d;color:#e6edf3;border:1px solid #30363d}
#confirm-cancel:hover{background:#30363d}
#confirm-ok{background:#f85149;color:#fff;border:none}
#confirm-ok:hover{background:#da3633}

/* Modal */
#modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.65);z-index:100;align-items:center;justify-content:center}
#modal-overlay.visible{display:flex}
#modal{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:24px;width:560px;max-width:95vw;max-height:90vh;overflow-y:auto}
#modal h2{font-size:17px;margin-bottom:18px;color:#e6edf3}
.form-row{margin-bottom:12px}
.form-label{display:block;font-size:12px;color:#8b949e;margin-bottom:4px;font-weight:600}
.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.btn-cancel{background:#21262d;color:#e6edf3;border:1px solid #30363d}
.btn-cancel:hover{background:#30363d}
.btn-submit{background:#238636;color:#fff;font-weight:600;padding:6px 18px}
.btn-submit:hover{background:#2ea043}

/* Toast */
#toast-container{position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:300;pointer-events:none}
.toast{background:#21262d;border:1px solid #30363d;border-radius:8px;padding:10px 16px;font-size:13px;color:#e6edf3;animation:fadein .2s ease;max-width:340px;pointer-events:auto}
.toast.success{border-color:#2ea043;background:#1a3a2a;color:#3fb950}
.toast.error{border-color:#f85149;background:#3a1a1a;color:#f85149}
@keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
#no-bugs{padding:30px;text-align:center;color:#8b949e}

/* List toolbar (count + sort) */
#list-toolbar{display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid #30363d;flex-shrink:0}
#bug-count{font-size:11px;color:#8b949e;margin-right:auto}
#sort-select,#priority-select{background:#0d1117;border:1px solid #30363d;color:#8b949e;border-radius:4px;padding:2px 5px;font-size:11px;cursor:pointer;width:auto}
#sort-select:focus,#priority-select:focus{outline:none;border-color:#58a6ff}
#btn-refresh{background:none;border:1px solid #30363d;color:#8b949e;padding:2px 8px;font-size:15px;line-height:1.4}
#btn-refresh:hover{background:#21262d;color:#e6edf3}
.kbd-hint{font-size:10px;color:#30363d;text-align:center;padding:5px;flex-shrink:0;user-select:none}

/* Overdue item highlight */
.bug-item.overdue:not(.selected){border-left:3px solid rgba(248,81,73,.55);background:rgba(248,81,73,.04)}

/* Clickable bug ID */
.copy-id{cursor:pointer}
.copy-id:hover{color:#58a6ff;text-decoration:underline}

/* Empty state CTA */
#btn-new-empty{background:#238636;color:#fff;padding:8px 20px;margin-top:8px;font-size:14px}
#btn-new-empty:hover{background:#2ea043}
</style>
</head>
<body>

<!-- Global error banner (JS errors surface here) -->
<div id="error-banner"></div>

<!-- Header -->
<div id="header">
  <h1>Bugbook</h1>
  <div class="stat-badge">Total: <span id="stat-total">0</span></div>
  <div class="stat-badge">Open: <span id="stat-open">0</span></div>
  <div class="stat-badge">Resolved: <span id="stat-resolved">0</span></div>
  <div class="stat-badge">Overdue: <span id="stat-overdue">0</span></div>
  <div id="header-right" style="display:flex;gap:8px;align-items:center">
    <button id="btn-refresh" title="Refresh (R)">↻</button>
    <button id="btn-new">+ New Bug</button>
  </div>
</div>

<!-- Layout -->
<div id="layout">
  <div id="left">
    <div id="search-bar">
      <input id="search-input" type="text" placeholder="Search bugs...">
    </div>
    <div id="filter-bar">
      <button class="filter-btn active" data-filter="all">All</button>
      <button class="filter-btn" data-filter="Open">Open</button>
      <button class="filter-btn" data-filter="Resolved">Resolved</button>
    </div>
    <div id="list-toolbar">
      <span id="bug-count">0 bugs</span>
      <select id="priority-select" title="Filter by priority">
        <option value="all">All</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
      <select id="sort-select" title="Sort by">
        <option value="newest">Newest</option>
        <option value="priority">Priority ↓</option>
        <option value="overdue">Overdue first</option>
        <option value="oldest">Oldest</option>
      </select>
    </div>
    <div id="bug-list"></div>
    <div class="kbd-hint">N new · E edit · Del delete · R refresh · ↑↓ nav</div>
  </div>

  <div id="right">
    <div id="empty-state">
      <h2>Select a bug</h2>
      <p>Choose a bug from the list or create a new one.</p>
      <button id="btn-new-empty">+ New Bug</button>
    </div>
    <div id="detail"></div>
  </div>
</div>

<!-- Modal (New / Edit bug) -->
<div id="modal-overlay">
  <div id="modal">
    <h2 id="modal-title">New Bug</h2>
    <form id="bug-form">
      <div class="form-row">
        <label class="form-label">Error / Description *</label>
        <textarea id="f-error" rows="3" placeholder="Describe the error or bug..."></textarea>
      </div>
      <div class="form-row">
        <label class="form-label">Solution</label>
        <textarea id="f-solution" rows="3" placeholder="How was it solved or what was tried?"></textarea>
      </div>
      <div class="form-row">
        <label class="form-label">Category</label>
        <input id="f-category" type="text" list="tag-list" placeholder="e.g. Backend">
        <datalist id="tag-list"></datalist>
      </div>
      <div class="form-row">
        <label class="form-label">Priority</label>
        <select id="f-priority">
          <option value="">-- None --</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>
      <div class="form-row">
        <label class="form-label">Author</label>
        <input id="f-author" type="text" placeholder="Your name">
      </div>
      <div class="form-row">
        <label class="form-label">Due Date</label>
        <input id="f-due" type="date">
      </div>
      <div class="form-row">
        <label class="form-label">Files (one per line)</label>
        <textarea id="f-files" rows="2" placeholder="src/api.ts"></textarea>
      </div>
      <div class="form-actions">
        <button type="button" id="btn-cancel-modal" class="btn-cancel">Cancel</button>
        <button type="submit" class="btn-submit" id="btn-submit">Add Bug</button>
      </div>
    </form>
  </div>
</div>

<!-- Custom confirm dialog (replaces window.confirm which may not work in Electron) -->
<div id="confirm-overlay">
  <div id="confirm-box">
    <p id="confirm-msg">Are you sure?</p>
    <div class="confirm-actions">
      <button id="confirm-cancel">Cancel</button>
      <button id="confirm-ok">Delete</button>
    </div>
  </div>
</div>

<!-- Toast container -->
<div id="toast-container"></div>

<script>
(function() {
'use strict';

// ─── Global error display ────────────────────────────────────────────────────
window.onerror = function(msg, src, line, col, err) {
  var banner = document.getElementById('error-banner');
  if (banner) {
    banner.textContent = 'JS Error: ' + msg + (src ? ' (' + src + ':' + line + ')' : '');
    banner.classList.add('visible');
  }
  return false;
};

window.addEventListener('unhandledrejection', function(e) {
  var banner = document.getElementById('error-banner');
  if (banner) {
    banner.textContent = 'Unhandled error: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
    banner.classList.add('visible');
  }
});

// ─── State ───────────────────────────────────────────────────────────────────
var state = {
  bugs: [],
  tags: [],
  selectedId: null,
  search: '',
  statusFilter: 'all',
  priorityFilter: 'all',
  sort: 'newest',
  editingId: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(undefined, {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
  catch(e) { return iso; }
}

function toast(msg, type) {
  var container = document.getElementById('toast-container');
  var el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(function() {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(function() { el.remove(); }, 350);
  }, 3500);
}

// ─── API ─────────────────────────────────────────────────────────────────────
var api = {
  get: function(path) {
    return fetch(path).then(function(r) {
      if (!r.ok) return r.json().catch(function(){return {error:'Request failed'};}).then(function(e){throw new Error(e.error||'Request failed');});
      return r.json();
    });
  },
  post: function(path, body) {
    return fetch(path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r) {
      if (!r.ok) return r.json().catch(function(){return {error:'Request failed'};}).then(function(e){throw new Error(e.error||'Request failed');});
      return r.json();
    });
  },
  put: function(path, body) {
    return fetch(path, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r) {
      if (!r.ok) return r.json().catch(function(){return {error:'Request failed'};}).then(function(e){throw new Error(e.error||'Request failed');});
      return r.json();
    });
  },
  del: function(path) {
    return fetch(path, {method:'DELETE'}).then(function(r) {
      if (!r.ok) return r.json().catch(function(){return {error:'Request failed'};}).then(function(e){throw new Error(e.error||'Request failed');});
      return r.json();
    });
  },
};

// ─── Custom confirm ───────────────────────────────────────────────────────────
var confirmResolve = null;
function customConfirm(msg) {
  return new Promise(function(resolve) {
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-overlay').classList.add('visible');
    confirmResolve = resolve;
  });
}
document.getElementById('confirm-ok').addEventListener('click', function() {
  document.getElementById('confirm-overlay').classList.remove('visible');
  if (confirmResolve) { confirmResolve(true); confirmResolve = null; }
});
document.getElementById('confirm-cancel').addEventListener('click', function() {
  document.getElementById('confirm-overlay').classList.remove('visible');
  if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
});

// ─── Data loading ─────────────────────────────────────────────────────────────
function loadData() {
  return Promise.all([api.get('/api/bugs'), api.get('/api/tags')]).then(function(results) {
    state.bugs = results[0];
    state.tags = results[1];
    renderStats();
    renderBugList();
    if (state.selectedId) {
      var bug = state.bugs.find(function(b){return b.id === state.selectedId;});
      if (bug) renderDetail(bug); else showEmpty();
    }
  }).catch(function(e) {
    toast('Failed to load data: ' + e.message, 'error');
    var banner = document.getElementById('error-banner');
    banner.textContent = 'Could not connect to Bugbook server: ' + e.message + '. Try restarting.';
    banner.classList.add('visible');
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function renderStats() {
  var total = state.bugs.length;
  var open = state.bugs.filter(function(b){return b.status==='Open';}).length;
  var resolved = state.bugs.filter(function(b){return b.status==='Resolved';}).length;
  var today = new Date(); today.setHours(0,0,0,0);
  var overdue = state.bugs.filter(function(b){return b.status!=='Resolved'&&b.dueDate&&new Date(b.dueDate+'T00:00:00')<today;}).length;
  document.getElementById('stat-total').textContent = String(total);
  document.getElementById('stat-open').textContent = String(open);
  document.getElementById('stat-resolved').textContent = String(resolved);
  document.getElementById('stat-overdue').textContent = String(overdue);
}

// ─── Bug list ─────────────────────────────────────────────────────────────────
function filteredBugs() {
  var bugs = state.bugs.slice();
  if (state.statusFilter !== 'all') bugs = bugs.filter(function(b){return b.status===state.statusFilter;});
  if (state.priorityFilter !== 'all') bugs = bugs.filter(function(b){return b.priority===state.priorityFilter;});
  if (state.search) {
    var q = state.search.toLowerCase();
    bugs = bugs.filter(function(b){
      return b.id.toLowerCase().includes(q)||b.error.toLowerCase().includes(q)||
        (b.solution||'').toLowerCase().includes(q)||(b.category||'').toLowerCase().includes(q)||
        (b.author||'').toLowerCase().includes(q);
    });
  }
  var pRank = {High:0,Medium:1,Low:2};
  var today2 = new Date(); today2.setHours(0,0,0,0);
  if (state.sort === 'priority') {
    bugs.sort(function(a,b){ return (pRank[a.priority]!=null?pRank[a.priority]:3)-(pRank[b.priority]!=null?pRank[b.priority]:3); });
  } else if (state.sort === 'overdue') {
    bugs.sort(function(a,b){
      var ao=(a.status!=='Resolved'&&a.dueDate&&new Date(a.dueDate+'T00:00:00')<today2)?0:1;
      var bo=(b.status!=='Resolved'&&b.dueDate&&new Date(b.dueDate+'T00:00:00')<today2)?0:1;
      return ao-bo || (b.timestamp||'').localeCompare(a.timestamp||'');
    });
  } else if (state.sort === 'oldest') {
    bugs.sort(function(a,b){return (a.timestamp||'').localeCompare(b.timestamp||'');});
  } else {
    bugs.sort(function(a,b){return (b.timestamp||'').localeCompare(a.timestamp||'');});
  }
  return bugs;
}

function renderBugList() {
  var list = document.getElementById('bug-list');
  var bugs = filteredBugs();
  var countEl = document.getElementById('bug-count');
  if (countEl) {
    var suffix = (state.statusFilter !== 'all' || state.search) ? ' (filtered)' : '';
    countEl.textContent = bugs.length + (bugs.length === 1 ? ' bug' : ' bugs') + suffix;
  }
  if (!bugs.length) { list.innerHTML = '<div id="no-bugs">No bugs found.</div>'; return; }
  var today = new Date(); today.setHours(0,0,0,0);
  list.innerHTML = bugs.map(function(b) {
    var overdue = b.status!=='Resolved'&&b.dueDate&&new Date(b.dueDate+'T00:00:00')<today;
    var statusBadge = b.status==='Open'?'<span class="badge badge-open">OPEN</span>':'<span class="badge badge-resolved">DONE</span>';
    var priBadge = b.priority?'<span class="badge badge-'+b.priority.toLowerCase()+'">'+esc(b.priority)+'</span>':'';
    var dot = overdue?'<span class="overdue-dot" title="Overdue"></span>':'';
    var sel = b.id===state.selectedId?' selected':'';
    var od = overdue?' overdue':'';
    var preview = (b.error||'').substring(0,60)+((b.error||'').length>60?'...':'');
    return '<div class="bug-item'+sel+od+'" data-id="'+esc(b.id)+'">'+
      '<div class="bug-item-id copy-id" data-action="copy-id" data-id="'+esc(b.id)+'" title="Click to copy ID">'+esc(b.id)+'</div>'+
      '<div class="bug-item-error">'+esc(preview)+'</div>'+
      '<div class="bug-item-meta">'+statusBadge+priBadge+dot+'</div>'+
      '</div>';
  }).join('');
}

// Event delegation for bug list clicks
document.getElementById('bug-list').addEventListener('click', function(e) {
  // Copy ID click (stop propagation so it doesn't also select the bug)
  var copyBtn = e.target.closest('[data-action="copy-id"]');
  if (copyBtn) {
    e.stopPropagation();
    var id = copyBtn.dataset.id;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(function(){
        toast('Copied ' + id, 'success');
      }).catch(function(){ toast('Copy failed', 'error'); });
    } else {
      toast('Clipboard not available', 'error');
    }
    return;
  }
  var item = e.target.closest('.bug-item');
  if (!item) return;
  var id = item.dataset.id;
  state.selectedId = id;
  var bug = state.bugs.find(function(b){return b.id===id;});
  renderBugList();
  if (bug) renderDetail(bug); else showEmpty();
});

// Filter buttons
document.getElementById('filter-bar').addEventListener('click', function(e) {
  var btn = e.target.closest('.filter-btn');
  if (!btn) return;
  state.statusFilter = btn.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  renderBugList();
});

// Search
document.getElementById('search-input').addEventListener('input', function() {
  state.search = this.value;
  renderBugList();
});

// ─── Detail panel ─────────────────────────────────────────────────────────────
function showEmpty() {
  document.getElementById('empty-state').style.display = '';
  document.getElementById('detail').style.display = 'none';
}

function renderDetail(bug) {
  document.getElementById('empty-state').style.display = 'none';
  var detail = document.getElementById('detail');
  detail.style.display = 'block';

  var today = new Date(); today.setHours(0,0,0,0);
  var overdue = bug.status!=='Resolved'&&bug.dueDate&&new Date(bug.dueDate+'T00:00:00')<today;
  var statusBadge = bug.status==='Open'?'<span class="badge badge-open">OPEN</span>':'<span class="badge badge-resolved">DONE</span>';
  var priBadge = bug.priority?'<span class="badge badge-'+bug.priority.toLowerCase()+'">'+esc(bug.priority)+'</span>':'';
  var overdueBadge = overdue?'<span class="badge" style="background:#3a1a1a;color:#f85149">OVERDUE</span>':'';

  var resolveLabel = bug.status==='Open'?'Resolve':'Re-open';
  var resolveClass = bug.status==='Open'?'btn-resolve':'btn-unresolve';

  var dueLine = bug.dueDate
    ? '<div class="detail-section"><div class="detail-label">Due Date</div><div class="detail-value"'+(overdue?' style="color:#f85149"':'')+'>'+esc(bug.dueDate)+(overdue?' — OVERDUE':'')+' </div></div>'
    : '';

  var filesHtml = bug.files&&bug.files.length
    ? '<div class="detail-section"><div class="detail-label">Files</div><ul class="files-list">'+bug.files.map(function(f){return '<li>'+esc(f)+'</li>';}).join('')+'</ul></div>'
    : '';

  var commentsHtml = bug.comments&&bug.comments.length
    ? bug.comments.map(function(c){
        var gh = c.source==='github';
        var meta = esc(c.author||'Unknown')+' &middot; '+fmtDate(c.timestamp)+(gh?' &middot; <span style="color:#6e40c9">GitHub</span>':'');
        return '<div class="comment'+(gh?' gh':'')+'"><div class="comment-meta">'+meta+'</div><div class="comment-text">'+esc(c.text)+'</div></div>';
      }).join('')
    : '<div style="color:#8b949e;font-size:12px">No comments yet.</div>';

  var githubHtml = bug.github_issue_number
    ? '<div class="github-section"><div class="detail-label">GitHub Issue</div><div style="margin-top:6px"><a href="'+esc(bug.github_issue_url||'#')+'" target="_blank">#'+bug.github_issue_number+'</a>'+(bug.github_issue_closed?' &middot; <span style="color:#8b949e">Closed</span>':' &middot; <span style="color:#3fb950">Open</span>')+'</div></div>'
    : '';

  var created = fmtDate(bug.timestamp);
  var modified = bug.last_modified?' &middot; Modified: '+fmtDate(bug.last_modified):'';

  detail.innerHTML =
    '<div class="detail-header">'+
      '<div>'+
        '<div class="detail-id">'+esc(bug.id)+'</div>'+
        '<div class="detail-badges">'+statusBadge+priBadge+overdueBadge+'</div>'+
      '</div>'+
      '<div class="detail-actions">'+
        '<button class="btn-edit" data-action="edit" data-id="'+esc(bug.id)+'">Edit</button>'+
        '<button class="'+resolveClass+'" data-action="resolve" data-id="'+esc(bug.id)+'">'+resolveLabel+'</button>'+
        '<button class="btn-delete" data-action="delete" data-id="'+esc(bug.id)+'">Delete</button>'+
      '</div>'+
    '</div>'+
    '<div class="detail-section"><div class="detail-label">Error</div><div class="detail-value">'+esc(bug.error||'')+'</div></div>'+
    '<div class="detail-section"><div class="detail-label">Solution</div><div class="detail-value">'+esc(bug.solution||'—')+'</div></div>'+
    '<div class="detail-grid">'+
      '<div class="detail-section"><div class="detail-label">Category</div><div class="detail-value">'+esc(bug.category||'—')+'</div></div>'+
      '<div class="detail-section"><div class="detail-label">Author</div><div class="detail-value">'+esc(bug.author||'—')+'</div></div>'+
    '</div>'+
    '<div class="detail-section"><div class="detail-label">Created</div><div class="detail-value" style="color:#8b949e">'+created+modified+'</div></div>'+
    dueLine+filesHtml+githubHtml+
    '<div class="detail-section">'+
      '<div class="detail-label">Comments ('+(bug.comments?bug.comments.length:0)+')</div>'+
      '<div id="comments-body" style="margin-top:8px">'+commentsHtml+'</div>'+
      '<div class="comment-input-row">'+
        '<input id="comment-input" type="text" placeholder="Add a comment...">'+
        '<button class="btn-comment" data-action="comment" data-id="'+esc(bug.id)+'">Post</button>'+
      '</div>'+
    '</div>';
}

// Event delegation for detail panel
document.getElementById('detail').addEventListener('click', function(e) {
  var btn = e.target.closest('button[data-action]');
  if (!btn) return;
  var action = btn.dataset.action;
  var id = btn.dataset.id;

  if (action === 'resolve') {
    api.post('/api/bugs/'+id+'/resolve', {}).then(function(bug) {
      var idx = state.bugs.findIndex(function(b){return b.id===id;});
      if (idx>=0) state.bugs[idx] = bug;
      renderStats(); renderBugList(); renderDetail(bug);
      toast(bug.status==='Resolved'?'Bug resolved.':'Bug re-opened.', 'success');
    }).catch(function(e){ toast(e.message,'error'); });
  }

  if (action === 'delete') {
    customConfirm('Delete bug '+id+'? This cannot be undone.').then(function(ok) {
      if (!ok) return;
      api.del('/api/bugs/'+id).then(function() {
        state.bugs = state.bugs.filter(function(b){return b.id!==id;});
        state.selectedId = null;
        renderStats(); renderBugList(); showEmpty();
        toast('Bug deleted.','success');
      }).catch(function(e){ toast(e.message,'error'); });
    });
  }

  if (action === 'edit') {
    var bug = state.bugs.find(function(b){return b.id===id;});
    if (bug) openModal(bug);
  }

  if (action === 'comment') {
    var input = document.getElementById('comment-input');
    var text = input.value.trim();
    if (!text) return;
    api.post('/api/bugs/'+id+'/comments', {text:text}).then(function(bug) {
      var idx = state.bugs.findIndex(function(b){return b.id===id;});
      if (idx>=0) state.bugs[idx] = bug;
      input.value = '';
      renderDetail(bug);
      toast('Comment added.','success');
    }).catch(function(e){ toast(e.message,'error'); });
  }
});

// Enter key in comment input triggers Post button
document.getElementById('detail').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && e.target.id === 'comment-input') {
    e.preventDefault();
    var btn = document.querySelector('#detail button[data-action="comment"]');
    if (btn) btn.click();
  }
});

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(bug) {
  try {
    state.editingId = bug ? bug.id : null;
    document.getElementById('modal-title').textContent = bug ? 'Edit Bug' : 'New Bug';
    document.getElementById('btn-submit').textContent = bug ? 'Save Changes' : 'Add Bug';
    document.getElementById('f-error').value = bug ? (bug.error||'') : '';
    document.getElementById('f-solution').value = bug ? (bug.solution||'') : '';
    document.getElementById('f-category').value = bug ? (bug.category||'') : '';
    document.getElementById('f-priority').value = bug ? (bug.priority||'') : '';
    document.getElementById('f-author').value = bug ? (bug.author||'') : '';
    document.getElementById('f-due').value = bug ? (bug.dueDate||'') : '';
    document.getElementById('f-files').value = bug ? (bug.files ? bug.files.join('\\n') : '') : '';
    var dl = document.getElementById('tag-list');
    dl.innerHTML = state.tags.map(function(t){return '<option value="'+esc(t)+'">';}).join('');
    document.getElementById('modal-overlay').classList.add('visible');
    setTimeout(function(){ document.getElementById('f-error').focus(); }, 50);
  } catch(err) {
    toast('Could not open form: ' + err.message, 'error');
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  state.editingId = null;
}

document.getElementById('btn-new').addEventListener('click', function() { openModal(null); });
document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);

document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeModal();
    document.getElementById('confirm-overlay').classList.remove('visible');
    if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
  }
});

document.getElementById('bug-form').addEventListener('submit', function(e) {
  e.preventDefault();
  var errVal = document.getElementById('f-error').value.trim();
  if (!errVal) { toast('Error description is required.', 'error'); return; }

  var filesRaw = document.getElementById('f-files').value.trim();
  var files = filesRaw ? filesRaw.split('\\n').map(function(f){return f.trim();}).filter(function(f){return f;}) : [];

  var priority = document.getElementById('f-priority').value;
  var author = document.getElementById('f-author').value.trim();
  var dueDate = document.getElementById('f-due').value;

  var payload = {
    error: errVal,
    solution: document.getElementById('f-solution').value.trim(),
    category: document.getElementById('f-category').value.trim() || 'General',
    priority: priority || undefined,
    author: author || undefined,
    dueDate: dueDate || undefined,
    files: files.length ? files : undefined,
  };

  var editingId = state.editingId;
  var p = editingId
    ? api.put('/api/bugs/'+editingId, payload)
    : api.post('/api/bugs', payload);

  p.then(function(bug) {
    if (editingId) {
      var idx = state.bugs.findIndex(function(b){return b.id===editingId;});
      if (idx>=0) state.bugs[idx]=bug; else state.bugs.push(bug);
      toast('Bug updated.','success');
    } else {
      state.bugs.push(bug);
      toast('Bug created.','success');
    }
    state.selectedId = bug.id;
    renderStats(); renderBugList(); renderDetail(bug); closeModal();
  }).catch(function(err) {
    toast(err.message, 'error');
  });
});

// ─── Toolbar / sort / priority / refresh ─────────────────────────────────────
document.getElementById('priority-select').addEventListener('change', function() {
  state.priorityFilter = this.value;
  renderBugList();
});

document.getElementById('sort-select').addEventListener('change', function() {
  state.sort = this.value;
  renderBugList();
});

document.getElementById('btn-refresh').addEventListener('click', function() {
  loadData().then(function(){ toast('Refreshed', 'success'); });
});

document.getElementById('btn-new-empty').addEventListener('click', function() {
  openModal(null);
});

// Auto-refresh when window regains focus (picks up CLI changes)
window.addEventListener('focus', function() { loadData(); });

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  // Ignore when a modal/confirm is open or when typing in a field
  if (document.getElementById('modal-overlay').classList.contains('visible')) return;
  if (document.getElementById('confirm-overlay').classList.contains('visible')) return;
  var tag = document.activeElement ? document.activeElement.tagName : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openModal(null); return; }
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    loadData().then(function(){ toast('Refreshed', 'success'); });
    return;
  }
  if ((e.key === 'e' || e.key === 'E') && state.selectedId) {
    e.preventDefault();
    var bugToEdit = state.bugs.find(function(b){ return b.id === state.selectedId; });
    if (bugToEdit) openModal(bugToEdit);
    return;
  }
  if (e.key === 'Delete' && state.selectedId) {
    e.preventDefault();
    var idToDel = state.selectedId;
    customConfirm('Delete bug ' + idToDel + '? This cannot be undone.').then(function(ok) {
      if (!ok) return;
      api.del('/api/bugs/' + idToDel).then(function() {
        state.bugs = state.bugs.filter(function(b){ return b.id !== idToDel; });
        state.selectedId = null;
        renderStats(); renderBugList(); showEmpty();
        toast('Bug deleted.', 'success');
      }).catch(function(e){ toast(e.message, 'error'); });
    });
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    var bugs = filteredBugs();
    if (!bugs.length) return;
    var idx = bugs.findIndex(function(b){ return b.id === state.selectedId; });
    if (e.key === 'ArrowDown') idx = Math.min(bugs.length - 1, idx + 1);
    else idx = Math.max(0, idx >= 0 ? idx - 1 : 0);
    if (idx < 0) idx = 0;
    state.selectedId = bugs[idx].id;
    renderBugList();
    renderDetail(bugs[idx]);
    var sel = document.querySelector('.bug-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadData();

})(); // end IIFE
</script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

// Generous limit — a fully-populated bug with long comments is still well under 100 KB.
const MAX_BODY_BYTES = 100 * 1024;

function readBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        req.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_BODY_BYTES) {
                reject(new Error('Request body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf-8');
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

function sendJSON(res: http.ServerResponse, data: unknown, status = 200): void {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

function sendError(res: http.ServerResponse, msg: string, status = 400): void {
    sendJSON(res, { error: msg }, status);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function routeRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method || 'GET';
    const url = req.url || '/';

    // Strip query string
    const path = url.split('?')[0];

    // Serve frontend
    if (method === 'GET' && path === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML);
        return;
    }

    // GET /api/bugs
    if (method === 'GET' && path === '/api/bugs') {
        const bugs = await getBugs();
        sendJSON(res, bugs);
        return;
    }

    // GET /api/tags
    if (method === 'GET' && path === '/api/tags') {
        const tags = await getTags();
        sendJSON(res, tags);
        return;
    }

    // GET /api/stats
    if (method === 'GET' && path === '/api/stats') {
        const bugs = await getBugs();
        const total = bugs.length;
        const open = bugs.filter(b => b.status === 'Open').length;
        const resolved = bugs.filter(b => b.status === 'Resolved').length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const overdue = bugs.filter(b => {
            if (!b.dueDate || b.status === 'Resolved') return false;
            return new Date(b.dueDate + 'T00:00:00') < today;
        }).length;
        const byCategory: Record<string, number> = {};
        bugs.forEach(b => { byCategory[b.category] = (byCategory[b.category] || 0) + 1; });
        sendJSON(res, { total, open, resolved, overdue, byCategory });
        return;
    }

    // POST /api/bugs — create
    if (method === 'POST' && path === '/api/bugs') {
        let body: Record<string, unknown>;
        try {
            body = (await readBody(req)) as Record<string, unknown>;
        } catch {
            sendError(res, 'Invalid JSON body');
            return;
        }

        const error = sanitizeInput(String(body.error || ''));
        if (!error) {
            sendError(res, 'error field is required');
            return;
        }

        const newBug: Bug = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            category: sanitizeInput(String(body.category || 'General')),
            error,
            solution: sanitizeInput(String(body.solution || '')),
            status: 'Open',
        };

        if (body.priority && ['High', 'Medium', 'Low'].includes(String(body.priority))) {
            newBug.priority = String(body.priority) as Bug['priority'];
        }
        if (body.author) newBug.author = sanitizeInput(String(body.author));
        if (body.dueDate) newBug.dueDate = String(body.dueDate);
        if (Array.isArray(body.files)) {
            newBug.files = (body.files as string[]).map(f => sanitizeInput(f)).filter(f => f);
        }

        await addBug(newBug);
        sendJSON(res, newBug, 201);
        return;
    }

    // Routes with /api/bugs/:id — validate ID format early to reject garbage paths
    const bugMatch = path.match(/^\/api\/bugs\/([A-Fa-f0-9]{1,8})(\/.*)?$/);
    if (bugMatch) {
        const id = bugMatch[1].toUpperCase();
        const sub = bugMatch[2] || '';

        // GET /api/bugs/:id
        if (method === 'GET' && sub === '') {
            const bug = await getBugById(id);
            if (!bug) { sendError(res, `Bug ${id} not found`, 404); return; }
            sendJSON(res, bug);
            return;
        }

        // PUT /api/bugs/:id — update
        if (method === 'PUT' && sub === '') {
            const bug = await getBugById(id);
            if (!bug) { sendError(res, `Bug ${id} not found`, 404); return; }

            let body: Record<string, unknown>;
            try {
                body = (await readBody(req)) as Record<string, unknown>;
            } catch {
                sendError(res, 'Invalid JSON body');
                return;
            }

            if ('error' in body) bug.error = sanitizeInput(String(body.error));
            if ('solution' in body) bug.solution = sanitizeInput(String(body.solution));
            if ('category' in body) bug.category = sanitizeInput(String(body.category));
            if ('priority' in body) {
                const p = String(body.priority);
                bug.priority = ['High', 'Medium', 'Low'].includes(p) ? p as Bug['priority'] : undefined;
            }
            if ('author' in body) bug.author = body.author ? sanitizeInput(String(body.author)) : undefined;
            if ('dueDate' in body) bug.dueDate = body.dueDate ? String(body.dueDate) : undefined;
            if ('status' in body && ['Open', 'Resolved'].includes(String(body.status))) {
                bug.status = String(body.status) as Bug['status'];
            }
            if ('files' in body && Array.isArray(body.files)) {
                bug.files = (body.files as string[]).map(f => sanitizeInput(f)).filter(f => f);
            }

            await saveBug(bug);
            sendJSON(res, bug);
            return;
        }

        // DELETE /api/bugs/:id
        if (method === 'DELETE' && sub === '') {
            const bug = await getBugById(id);
            if (!bug) { sendError(res, `Bug ${id} not found`, 404); return; }
            await deleteBug(id);
            sendJSON(res, { ok: true });
            return;
        }

        // POST /api/bugs/:id/resolve — toggle
        if (method === 'POST' && sub === '/resolve') {
            const bug = await getBugById(id);
            if (!bug) { sendError(res, `Bug ${id} not found`, 404); return; }
            bug.status = bug.status === 'Open' ? 'Resolved' : 'Open';
            await saveBug(bug);
            sendJSON(res, bug);
            return;
        }

        // POST /api/bugs/:id/comments
        if (method === 'POST' && sub === '/comments') {
            const bug = await getBugById(id);
            if (!bug) { sendError(res, `Bug ${id} not found`, 404); return; }

            let body: Record<string, unknown>;
            try {
                body = (await readBody(req)) as Record<string, unknown>;
            } catch {
                sendError(res, 'Invalid JSON body');
                return;
            }

            const text = sanitizeInput(String(body.text || ''));
            if (!text) { sendError(res, 'text is required'); return; }

            const comment: BugComment = {
                text,
                timestamp: new Date().toISOString(),
            };

            if (!bug.comments) bug.comments = [];
            bug.comments.push(comment);
            await saveBug(bug);
            sendJSON(res, bug);
            return;
        }
    }

    // 404
    sendError(res, `Not found: ${method} ${path}`, 404);
}

// ---------------------------------------------------------------------------
// Shared server factory — used by both `serve` and `app` (Electron)
// ---------------------------------------------------------------------------

/**
 * Start the Bugbook HTTP server on the given port.
 * Resolves with the http.Server once listening.
 * Rejects with the raw error (check err.code === 'EADDRINUSE').
 * Pass enableLog=false to suppress per-request console output (e.g. in Electron).
 */
export function startServer(port: number, enableLog = true): Promise<http.Server> {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            const start = Date.now();
            const method = req.method || 'GET';
            const url = (req.url || '/').split('?')[0];

            if (enableLog && url !== '/') {
                res.on('finish', () => {
                    const ms = Date.now() - start;
                    const code = res.statusCode;
                    const color = code >= 500 ? '\x1b[31m'
                                : code >= 400 ? '\x1b[33m'
                                : '\x1b[32m';
                    console.log(`  ${color}${code}\x1b[0m  ${method} ${url} ${ms}ms`);
                });
            }

            try {
                await routeRequest(req, res);
            } catch (err) {
                console.error('Server error:', err);
                if (!res.headersSent) {
                    sendError(res, 'Internal server error', 500);
                }
            }
        });

        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

// ---------------------------------------------------------------------------
// Exported command handler — `bugbook serve`
// ---------------------------------------------------------------------------

export const handleServe = async (args: string[]): Promise<void> => {
    if (!ensureProjectInit()) {
        console.error('Bugbook is not initialized in this directory. Run "bugbook init" first.');
        return;
    }

    // Parse --port flag
    let port = 3000;
    const portIdx = args.indexOf('--port');
    if (portIdx !== -1 && args[portIdx + 1]) {
        const parsed = parseInt(args[portIdx + 1], 10);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
            port = parsed;
        } else {
            console.error('Invalid port number. Using default 3000.');
        }
    }

    let server: http.Server;
    try {
        server = await startServer(port, true);
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use. Try --port <number> to use a different port.`);
        } else {
            console.error('Server error:', (e as Error).message);
        }
        return;
    }

    const url = `http://localhost:${port}`;
    console.log(`Bugbook web UI running at ${url}`);
    console.log('Press Ctrl+C to stop.');

    const platform = process.platform;
    const openCmd = platform === 'win32' ? `start ${url}`
        : platform === 'darwin' ? `open ${url}`
        : `xdg-open ${url}`;
    exec(openCmd, { timeout: 5000 }, (err) => {
        if (err) {
            console.log(`Could not open browser automatically. Visit ${url} manually.`);
        }
    });

    process.on('SIGINT', () => {
        console.log('\nShutting down Bugbook web UI...');
        server.close(() => process.exit(0));
    });
};
