const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('node:path');
const crypto = require('node:crypto');
const { roleFor, can } = require('./access');
const { fileToHtml, titleFromFilename, MAX_BYTES, stripDangerous } = require('./importer');

const MAX_TITLE = 120;
const MAX_CONTENT = 1_000_000; // ~1 MB of HTML

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const newId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const now = () => new Date().toISOString();

function cleanTitle(raw) {
  if (typeof raw !== 'string') throw new HttpError(400, 'Title must be a string');
  const t = raw.trim();
  if (!t) throw new HttpError(400, 'Title cannot be empty');
  if (t.length > MAX_TITLE) throw new HttpError(400, `Title must be at most ${MAX_TITLE} characters`);
  return t;
}

function cleanContent(raw) {
  if (typeof raw !== 'string') throw new HttpError(400, 'Content must be a string');
  if (raw.length > MAX_CONTENT) throw new HttpError(413, 'Document is too large');
  return stripDangerous(raw);
}

function createApp(db, { cookieSecret = process.env.COOKIE_SECRET || 'dev-secret-change-me' } = {}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser(cookieSecret));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

  // ---- Mock auth: pick a seeded user, stored in a signed cookie ----
  app.get('/api/users', (req, res) => {
    res.json(db.prepare('SELECT id, email, name FROM users ORDER BY name').all());
  });

  app.post('/api/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);
    if (!user) throw new HttpError(401, 'Unknown user');
    res.cookie('uid', user.id, { signed: true, httpOnly: true, sameSite: 'lax' });
    res.json(user);
  });

  app.post('/api/logout', (req, res) => {
    res.clearCookie('uid');
    res.json({ ok: true });
  });

  const requireUser = (req, res, next) => {
    const uid = req.signedCookies?.uid;
    const user = uid && db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(uid);
    if (!user) return next(new HttpError(401, 'Please log in'));
    req.user = user;
    next();
  };

  // Loads the doc and the caller's role; 404 when the caller has no access
  // (so we don't leak which document ids exist).
  const loadDoc = (need) => (req, res, next) => {
    const { exists, role } = roleFor(db, req.params.id, req.user.id);
    if (!exists || !can.read(role)) return next(new HttpError(404, 'Document not found'));
    if (!can[need](role)) return next(new HttpError(403, `You need ${need} access for this action`));
    req.role = role;
    next();
  };

  app.get('/api/me', requireUser, (req, res) => res.json(req.user));

  // ---- Documents ----
  app.get('/api/documents', requireUser, (req, res) => {
    const owned = db
      .prepare('SELECT id, title, updated_at FROM documents WHERE owner_id = ? ORDER BY updated_at DESC')
      .all(req.user.id);
    const shared = db
      .prepare(
        `SELECT d.id, d.title, d.updated_at, s.role, u.name AS owner_name
         FROM shares s JOIN documents d ON d.id = s.document_id JOIN users u ON u.id = d.owner_id
         WHERE s.user_id = ? ORDER BY d.updated_at DESC`
      )
      .all(req.user.id);
    res.json({ owned, shared });
  });

  app.post('/api/documents', requireUser, (req, res) => {
    const title = req.body?.title === undefined ? 'Untitled document' : cleanTitle(req.body.title);
    const content = req.body?.content === undefined ? '' : cleanContent(req.body.content);
    const id = newId('d');
    const t = now();
    db.prepare('INSERT INTO documents (id, owner_id, title, content, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(
      id, req.user.id, title, content, t, t
    );
    res.status(201).json(getDoc(id, 'owner'));
  });

  // Upload a file and turn it into a new document owned by the caller.
  app.post('/api/documents/import', requireUser, upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded (field name: "file")');
    const html = await fileToHtml(req.file.originalname, req.file.buffer);
    const id = newId('d');
    const t = now();
    db.prepare('INSERT INTO documents (id, owner_id, title, content, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(
      id, req.user.id, titleFromFilename(req.file.originalname), html, t, t
    );
    res.status(201).json(getDoc(id, 'owner'));
  });

  // Convert a file to HTML without creating a doc (used to insert into an existing draft).
  app.post('/api/convert', requireUser, upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded (field name: "file")');
    res.json({ html: await fileToHtml(req.file.originalname, req.file.buffer) });
  });

  function getDoc(id, role) {
    const doc = db
      .prepare(
        `SELECT d.id, d.title, d.content, d.created_at, d.updated_at, d.owner_id, u.name AS owner_name, u.email AS owner_email
         FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?`
      )
      .get(id);
    return { ...doc, role };
  }

  app.get('/api/documents/:id', requireUser, loadDoc('read'), (req, res) => {
    res.json(getDoc(req.params.id, req.role));
  });

  app.patch('/api/documents/:id', requireUser, loadDoc('edit'), (req, res) => {
    const { title, content } = req.body || {};
    if (title === undefined && content === undefined) throw new HttpError(400, 'Nothing to update');
    const sets = [];
    const args = [];
    if (title !== undefined) { sets.push('title = ?'); args.push(cleanTitle(title)); }
    if (content !== undefined) { sets.push('content = ?'); args.push(cleanContent(content)); }
    sets.push('updated_at = ?');
    args.push(now(), req.params.id);
    db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).run(...args);
    res.json(getDoc(req.params.id, req.role));
  });

  app.delete('/api/documents/:id', requireUser, loadDoc('manage'), (req, res) => {
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  // ---- Sharing (owner only) ----
  app.get('/api/documents/:id/shares', requireUser, loadDoc('read'), (req, res) => {
    res.json(
      db
        .prepare(
          `SELECT u.id AS user_id, u.email, u.name, s.role FROM shares s JOIN users u ON u.id = s.user_id
           WHERE s.document_id = ? ORDER BY u.name`
        )
        .all(req.params.id)
    );
  });

  app.put('/api/documents/:id/shares', requireUser, loadDoc('manage'), (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = req.body?.role || 'editor';
    if (!['viewer', 'editor'].includes(role)) throw new HttpError(400, 'Role must be "viewer" or "editor"');
    const target = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);
    if (!target) throw new HttpError(404, `No user with email "${email}"`);
    if (target.id === req.user.id) throw new HttpError(400, 'You already own this document');
    db.prepare(
      `INSERT INTO shares (document_id, user_id, role, created_at) VALUES (?,?,?,?)
       ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`
    ).run(req.params.id, target.id, role, now());
    res.json({ user_id: target.id, email: target.email, name: target.name, role });
  });

  app.delete('/api/documents/:id/shares/:userId', requireUser, loadDoc('manage'), (req, res) => {
    db.prepare('DELETE FROM shares WHERE document_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
    res.status(204).end();
  });

  // ---- Errors ----
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 2 MB' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
  });

  return app;
}

module.exports = { createApp };
