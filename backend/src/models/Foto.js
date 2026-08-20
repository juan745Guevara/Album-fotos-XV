const db = require('../config/db');

async function create({ mesaId, url, storageKey }, client = db) {
  const result = await client.query(
    `
      INSERT INTO fotos (mesa_id, url_imagen, storage_key)
      VALUES ($1, $2, $3)
      RETURNING id, mesa_id, url_imagen, storage_key, fecha_subida
    `,
    [mesaId, url, storageKey]
  );
  return result.rows[0];
}

async function listByMesa(mesaId) {
  const result = await db.query(
    `
      SELECT id, url_imagen, fecha_subida
      FROM fotos
      WHERE mesa_id = $1
      ORDER BY fecha_subida DESC
    `,
    [mesaId]
  );
  return result.rows;
}

async function listAll(mesaId = null) {
  if (mesaId) {
    const result = await db.query(
      `
        SELECT f.id, f.mesa_id, f.url_imagen, f.storage_key,
               f.fecha_subida, m.nombre AS mesa_nombre
        FROM fotos f
        JOIN mesas m ON m.id = f.mesa_id
        WHERE f.mesa_id = $1
        ORDER BY f.fecha_subida DESC
      `,
      [mesaId]
    );
    return result.rows;
  }

  const result = await db.query(
    `
      SELECT f.id, f.mesa_id, f.url_imagen, f.storage_key,
             f.fecha_subida, m.nombre AS mesa_nombre
      FROM fotos f
      JOIN mesas m ON m.id = f.mesa_id
      ORDER BY f.fecha_subida DESC
    `
  );
  return result.rows;
}

module.exports = {
  create,
  listByMesa,
  listAll,
};
