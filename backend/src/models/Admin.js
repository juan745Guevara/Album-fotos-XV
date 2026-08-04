const db = require('../config/db');

async function findByUsuario(usuario) {
  const result = await db.query(
    'SELECT id, usuario, password_hash FROM admins WHERE usuario = $1',
    [usuario]
  );
  return result.rows[0] || null;
}

module.exports = {
  findByUsuario,
};
