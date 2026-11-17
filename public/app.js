/* Ajaia Docs — vanilla JS single-page app. Routes: #/ (home), #/doc/:id (editor). */
(() => {
  const view = document.getElementById('view');
  const userbox = document.getElementById('userbox');
  const ACCEPT = '.txt,.md,.markdown,.docx';
  let me = null;
  let cleanupEditor = null; // flushes pending saves when leaving the editor

  // ---------- helpers ----------
  async function api(path, opts = {}) {
    const init = { credentials: 'same-origin', ...opts };
    if (opts.json !== undefined) {
      init.body = JSON.stringify(opts.json);
      init.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    }
    const res = await fetch(path, init);
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = 'toast'), 3000);
  }

  function timeAgo(iso) {
    const s = Math.round((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString();
  }

  function pickFile() {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: ACCEPT });
      input.onchange = () => resolve(input.files[0] || null);
      input.click();
    });
  }

  function uploadForm(file) {
    const fd = new FormData();
    fd.append('file', file);
    return { method: 'POST', body: fd };
  }

  function renderUserbox() {
    if (!me) { userbox.innerHTML = ''; return; }
    userbox.innerHTML = `<span>Signed in as <strong>${esc(me.name)}</strong></span>
      <button class="btn" id="logoutBtn">Switch user</button>`;
    document.getElementById('logoutBtn').onclick = async () => {
      await api('/api/logout', { method: 'POST' });
      me = null;
      location.hash = '#/';
      route();
    };
  }

  // ---------- views ----------
  async function renderLogin() {
    const users = await api('/api/users');
    view.innerHTML = `<div class="login">
      <h1>Sign in</h1>
      <p>Demo accounts — pick one. Log in as a second user to see sharing in action.</p>
      ${users.map((u) => `<button class="user-option" data-email="${esc(u.email)}"><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></button>`).join('')}
    </div>`;
    view.querySelectorAll('.user-option').forEach((b) => {
      b.onclick = async () => {
        me = await api('/api/login', { method: 'POST', json: { email: b.dataset.email } });
        route();
      };
    });
  }

  function docRow(d, shared) {
    const sub = shared
      ? `Owned by ${esc(d.owner_name)} · edited ${timeAgo(d.updated_at)}`
      : `Edited ${timeAgo(d.updated_at)}`;
    const badge = shared ? `<span class="badge ${d.role}">${d.role === 'editor' ? 'Can edit' : 'View only'}</span>` : `<span class="badge owner">Owner</span>`;
    return `<li><a href="#/doc/${esc(d.id)}"><span class="doc-icon"></span>
      <span class="doc-meta"><div class="doc-title">${esc(d.title)}</div><div class="doc-sub">${sub}</div></span>${badge}</a></li>`;
  }

  async function renderHome() {
    const { owned, shared } = await api('/api/documents');
    view.innerHTML = `
      <div class="home-head">
        <h1>Documents</h1>
        <div class="actions">
          <button class="btn" id="importBtn">⬆ Import file</button>
          <button class="btn primary" id="newBtn">+ New document</button>
        </div>
      </div>
      <p class="hint">Import supports <strong>.txt, .md and .docx</strong> (max 2 MB) — the file becomes a new editable document.</p>
      <h2 class="section-title">My documents (${owned.length})</h2>
      ${owned.length ? `<ul class="doc-list">${owned.map((d) => docRow(d, false)).join('')}</ul>` : `<div class="empty">No documents yet. Create one or import a file.</div>`}
      <h2 class="section-title">Shared with me (${shared.length})</h2>
      ${shared.length ? `<ul class="doc-list">${shared.map((d) => docRow(d, true)).join('')}</ul>` : `<div class="empty">Nothing has been shared with you yet.</div>`}
    `;
    document.getElementById('newBtn').onclick = async () => {
      const doc = await api('/api/documents', { method: 'POST', json: {} });
      location.hash = `#/doc/${doc.id}`;
    };
    document.getElementById('importBtn').onclick = async () => {
      const file = await pickFile();
      if (!file) return;
      try {
        const doc = await api('/api/documents/import', uploadForm(file));
        toast(`Imported "${doc.title}"`);
        location.hash = `#/doc/${doc.id}`;
      } catch (e) { toast(e.message, true); }
    };
  }

  async function renderEditor(id) {
    let doc;
    try { doc = await api(`/api/documents/${encodeURIComponent(id)}`); }
    catch (e) {
      view.innerHTML = `<div class="empty">${esc(e.message)}. <a href="#/">Back to documents</a></div>`;
      return;
    }
    const canEdit = doc.role === 'owner' || doc.role === 'editor';
    const isOwner = doc.role === 'owner';
    const roleLabel = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' }[doc.role];

    view.innerHTML = `
      <div class="editor-head">
        <a href="#/" class="btn" aria-label="Back">←</a>
        <input id="title" class="title-input" maxlength="120" value="${esc(doc.title)}" ${canEdit ? '' : 'readonly'} aria-label="Document title" />
        <span id="saveStatus" class="save-status">${canEdit ? 'Saved' : ''}</span>
        ${canEdit ? `<button class="btn" id="insertBtn" title="Insert .txt, .md or .docx content at the cursor">⬆ Insert file</button>` : ''}
        ${isOwner ? `<button class="btn primary" id="shareBtn">Share</button>` : ''}
        ${isOwner ? `<button class="btn danger" id="deleteBtn">Delete</button>` : ''}
      </div>
      <div class="doc-info"><span class="badge ${doc.role}">${roleLabel}</span> Owner: ${esc(doc.owner_name)}</div>
      ${canEdit ? '' : `<div class="readonly-banner">You have view-only access. Ask ${esc(doc.owner_name)} for edit access.</div>`}
      <div class="editor-shell"><div id="editor"></div></div>
    `;

    const quill = new Quill('#editor', {
      theme: 'snow',
      readOnly: !canEdit,
      placeholder: canEdit ? 'Start writing…' : '',
      modules: {
        toolbar: canEdit
          ? [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote', 'link'], ['clean']]
          : false,
      },
    });
    quill.setContents(quill.clipboard.convert({ html: doc.content || '' }), 'silent');
    if (!canEdit) return;

    // ---- autosave (debounced) ----
    const status = document.getElementById('saveStatus');
    const titleEl = document.getElementById('title');
    const pending = {};
    let timer = null;
    let inFlight = Promise.resolve();

    const setStatus = (text, err = false) => { status.textContent = text; status.className = 'save-status' + (err ? ' error' : ''); };

    function schedule(field, value) {
      pending[field] = value;
      setStatus('Unsaved…');
      clearTimeout(timer);
      timer = setTimeout(flush, 700);
    }

    function flush() {
      clearTimeout(timer);
      if (!Object.keys(pending).length) return inFlight;
      const body = { ...pending };
      for (const k of Object.keys(pending)) delete pending[k];
      setStatus('Saving…');
      inFlight = inFlight.then(() =>
        api(`/api/documents/${encodeURIComponent(id)}`, { method: 'PATCH', json: body })
          .then(() => { if (!Object.keys(pending).length) setStatus('Saved'); })
          .catch((e) => {
            for (const k of Object.keys(body)) if (!(k in pending)) pending[k] = body[k]; // keep newest values; retried on next change
            setStatus('Not saved', true);
            toast(`Save failed: ${e.message}`, true);
          })
      );
      return inFlight;
    }

    quill.on('text-change', (delta, old, source) => { if (source === 'user' || source === 'api') schedule('content', quill.root.innerHTML); });
    titleEl.addEventListener('input', () => {
      const t = titleEl.value.trim();
      if (!t) { setStatus('Title required', true); return; }
      schedule('title', t);
    });
    titleEl.addEventListener('blur', () => { if (!titleEl.value.trim()) { titleEl.value = doc.title; setStatus('Saved'); } });

    const beforeUnload = (e) => {
      if (Object.keys(pending).length) {
        fetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'PATCH', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending) });
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    cleanupEditor = () => { window.removeEventListener('beforeunload', beforeUnload); return flush(); };

    document.getElementById('insertBtn').onclick = async () => {
      const file = await pickFile();
      if (!file) return;
      try {
        const { html } = await api('/api/convert', uploadForm(file));
        const at = (quill.getSelection(true) || { index: quill.getLength() }).index;
        quill.updateContents(new (Quill.import('delta'))().retain(at).concat(quill.clipboard.convert({ html })), 'user');
        toast(`Inserted content from ${file.name}`);
      } catch (e) { toast(e.message, true); }
    };

    if (isOwner) {
      document.getElementById('shareBtn').onclick = () => openShareDialog(id);
      document.getElementById('deleteBtn').onclick = async () => {
        if (!confirm(`Delete "${titleEl.value}"? This cannot be undone.`)) return;
        await api(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
        window.removeEventListener('beforeunload', beforeUnload);
        cleanupEditor = null;
        toast('Document deleted');
        location.hash = '#/';
      };
    }
  }

  // ---------- sharing ----------
  const dlg = document.getElementById('shareDialog');
  async function openShareDialog(id) {
    const errEl = document.getElementById('shareError');
    const list = document.getElementById('shareList');
    const users = await api('/api/users');
    document.getElementById('userEmails').innerHTML = users.filter((u) => u.id !== me.id).map((u) => `<option value="${esc(u.email)}">${esc(u.name)}</option>`).join('');

    async function refresh() {
      const shares = await api(`/api/documents/${encodeURIComponent(id)}/shares`);
      list.innerHTML = `<li><div class="who"><strong>${esc(me.name)} (you)</strong><small>${esc(me.email)}</small></div><span class="badge owner">Owner</span></li>` +
        shares.map((s) => `<li><div class="who"><strong>${esc(s.name)}</strong><small>${esc(s.email)}</small></div>
          <select data-email="${esc(s.email)}" class="role-select"><option value="editor" ${s.role === 'editor' ? 'selected' : ''}>Can edit</option><option value="viewer" ${s.role === 'viewer' ? 'selected' : ''}>Can view</option></select>
          <button class="icon-btn" data-remove="${esc(s.user_id)}" title="Remove access">✕</button></li>`).join('');
      list.querySelectorAll('.role-select').forEach((sel) => {
        sel.onchange = async () => {
          await api(`/api/documents/${encodeURIComponent(id)}/shares`, { method: 'PUT', json: { email: sel.dataset.email, role: sel.value } });
          toast('Access updated');
        };
      });
      list.querySelectorAll('[data-remove]').forEach((b) => {
        b.onclick = async () => {
          await api(`/api/documents/${encodeURIComponent(id)}/shares/${encodeURIComponent(b.dataset.remove)}`, { method: 'DELETE' });
          toast('Access removed');
          refresh();
        };
      });
    }

    document.getElementById('shareForm').onsubmit = async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      const emailEl = document.getElementById('shareEmail');
      try {
        const s = await api(`/api/documents/${encodeURIComponent(id)}/shares`, { method: 'PUT', json: { email: emailEl.value, role: document.getElementById('shareRole').value } });
        toast(`Shared with ${s.name}`);
        emailEl.value = '';
        refresh();
      } catch (err) { errEl.textContent = err.message; errEl.hidden = false; }
    };
    errEl.hidden = true;
    await refresh();
    dlg.showModal();
  }

  // ---------- router ----------
  async function route() {
    if (cleanupEditor) { const c = cleanupEditor; cleanupEditor = null; await c(); }
    if (dlg.open) dlg.close();
    try {
      if (!me) me = await api('/api/me').catch(() => null);
      renderUserbox();
      if (!me) return renderLogin();
      const m = location.hash.match(/^#\/doc\/(.+)$/);
      if (m) await renderEditor(decodeURIComponent(m[1]));
      else await renderHome();
    } catch (e) {
      if (e.status === 401) { me = null; renderUserbox(); return renderLogin(); }
      view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
