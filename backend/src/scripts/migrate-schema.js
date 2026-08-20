/**
 * Renombra columnas legacy de Cloudinary a nombres genéricos (S3).
 */
async function migrateFotosColumns(client) {
  const legacy = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'fotos' AND column_name = 'url_cloudinary'
  `);

  if (legacy.rows.length === 0) {
    return;
  }

  await client.query(`
    ALTER TABLE fotos RENAME COLUMN url_cloudinary TO url_imagen
  `);
  await client.query(`
    ALTER TABLE fotos RENAME COLUMN public_id_cloudinary TO storage_key
  `);

  console.log('Migración OK: url_cloudinary → url_imagen, public_id_cloudinary → storage_key');
}

module.exports = { migrateFotosColumns };
