// Access rules live in one place so they are easy to read and to test.
// Roles, strongest first: owner > editor > viewer.

function roleFor(db, documentId, userId) {
  const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(documentId);
  if (!doc) return { exists: false, role: null };
  if (doc.owner_id === userId) return { exists: true, role: 'owner' };
  const share = db.prepare('SELECT role FROM shares WHERE document_id = ? AND user_id = ?').get(documentId, userId);
  return { exists: true, role: share ? share.role : null };
}

const can = {
  read: (role) => role === 'owner' || role === 'editor' || role === 'viewer',
  edit: (role) => role === 'owner' || role === 'editor',
  manage: (role) => role === 'owner', // manage sharing, delete
};

module.exports = { roleFor, can };
