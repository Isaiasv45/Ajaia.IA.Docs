// SQLite persistence using Node's built-in driver (no native build step).
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SEED_USERS = [
  { id: 'u_alice', email: 'alice@ajaia.test', name: 'Alice Owner' },
  { id: 'u_bob', email: 'bob@ajaia.test', name: 'Bob Editor' },
  { id: 'u_carol', email: 'carol@ajaia.test', name: 'Carol Viewer' },
];

function openDb(file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shares (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK (role IN ('viewer','editor')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (document_id, user_id)
    );
  `);
  const insert = db.prepare('INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)');
  for (const u of SEED_USERS) insert.run(u.id, u.email, u.name);
  seedWelcomeDoc(db);
  return db;
}

// One demo document so reviewers see the sharing model immediately.
function seedWelcomeDoc(db) {
  const exists = db.prepare("SELECT 1 FROM documents WHERE id = 'd_welcome'").get();
  if (exists) return;
  const now = new Date().toISOString();
  db.prepare('INSERT INTO documents (id, owner_id, title, content, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(
    'd_welcome',
    'u_alice',
    'Welcome to Ajaia Docs',
    '<h1>Welcome to Ajaia Docs</h1><p>This document is owned by <strong>Alice</strong>, shared with <em>Bob</em> as an <u>editor</u> and with Carol as a viewer.</p><h2>Try it</h2><ul><li>Format text with the toolbar</li><li>Rename the document from the title field</li><li>Import a .txt, .md or .docx file</li></ul><ol><li>Log in as a different user</li><li>Open "Shared with me"</li></ol>',
    now,
    now
  );
  const share = db.prepare('INSERT INTO shares (document_id, user_id, role, created_at) VALUES (?,?,?,?)');
  share.run('d_welcome', 'u_bob', 'editor', now);
  share.run('d_welcome', 'u_carol', 'viewer', now);
}

module.exports = { openDb, SEED_USERS };
