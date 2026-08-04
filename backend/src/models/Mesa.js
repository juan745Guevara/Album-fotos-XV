const db = require('../config/db');

async function findById(id, client = db) {
  const result = await client.query(
    'SELECT id, nombre, cantidad_fotos FROM mesas WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function findByIdForUpdate(id, client) {
  const result = await client.query(
    'SELECT id, nombre, cantidad_fotos FROM mesas WHERE id = $1 FOR UPDATE',
    [id]
  );
  return result.rows[0] || null;
}

async function listAll() {
  const result = await db.query(
    'SELECT id, nombre, cantidad_fotos FROM mesas ORDER BY id ASC'
  );
  return result.rows;
}

async function incrementFotoCount(id, client) {
  const result = await client.query(
    `
      UPDATE mesas
      SET cantidad_fotos = cantidad_fotos + 1
      WHERE id = $1
      RETURNING cantidad_fotos
    `,
    [id]
  );
  return result.rows[0].cantidad_fotos;
}

module.exports = {
  findById,
  findByIdForUpdate,
  listAll,
  incrementFotoCount,
};
