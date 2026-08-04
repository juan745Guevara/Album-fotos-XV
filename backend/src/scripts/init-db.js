require('dotenv').config();
const db = require('../config/db');

async function initDb() {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mesas (
        id INTEGER PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        cantidad_fotos INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_fotos >= 0)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS fotos (
        id SERIAL PRIMARY KEY,
        mesa_id INTEGER NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
        url_cloudinary TEXT NOT NULL,
        public_id_cloudinary TEXT NOT NULL,
        fecha_subida TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fotos_mesa_id ON fotos(mesa_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        usuario VARCHAR(100) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
      );
    `);

    await client.query('COMMIT');
    console.log('Tablas creadas/verificadas correctamente.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al inicializar la base de datos:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

initDb();
