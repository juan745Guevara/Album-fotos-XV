require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { migrateFotosColumns } = require('./migrate-schema');

const TOTAL_MESAS = 10;

async function seed() {
  const client = await db.getClient();
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

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
        url_imagen TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        fecha_subida TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await migrateFotosColumns(client);

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

    for (let i = 1; i <= TOTAL_MESAS; i += 1) {
      await client.query(
        `
          INSERT INTO mesas (id, nombre, cantidad_fotos)
          VALUES ($1, $2, 0)
          ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre
        `,
        [i, `Mesa ${i}`]
      );
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await client.query(
      `
        INSERT INTO admins (usuario, password_hash)
        VALUES ($1, $2)
        ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash
      `,
      [adminUser, passwordHash]
    );

    await client.query('COMMIT');
    console.log(`Seed OK: ${TOTAL_MESAS} mesas + admin "${adminUser}".`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en seed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

seed();
