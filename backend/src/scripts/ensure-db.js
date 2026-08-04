require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está definida en .env');
  }

  const adminUrl = databaseUrl.replace(/\/[^/]+$/, '/postgres');
  const client = new Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 5000,
  });

  await client.connect();
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = 'album_fotos_qr'"
  );

  if (result.rowCount === 0) {
    await client.query('CREATE DATABASE album_fotos_qr');
    console.log('Base de datos album_fotos_qr creada.');
  } else {
    console.log('Base de datos album_fotos_qr ya existe.');
  }

  await client.end();
}

main().catch((err) => {
  console.error('No se pudo conectar a PostgreSQL:', err.message);
  process.exit(1);
});
