const db = require('../config/db');
const { uploadBuffer } = require('../config/cloudinary');

const MAX_FOTOS = Number(process.env.MAX_FOTOS_POR_MESA) || 10;

async function getMesa(req, res) {
  const mesaId = Number(req.params.id);

  if (!Number.isInteger(mesaId) || mesaId < 1 || mesaId > 10) {
    return res.status(400).json({ error: 'ID de mesa inválido. Debe ser 1–10.' });
  }

  try {
    const mesaResult = await db.query(
      'SELECT id, nombre, cantidad_fotos FROM mesas WHERE id = $1',
      [mesaId]
    );

    if (mesaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Mesa no encontrada.' });
    }

    const fotosResult = await db.query(
      `
        SELECT id, url_cloudinary, fecha_subida
        FROM fotos
        WHERE mesa_id = $1
        ORDER BY fecha_subida DESC
      `,
      [mesaId]
    );

    const mesa = mesaResult.rows[0];

    return res.json({
      id: mesa.id,
      nombre: mesa.nombre,
      cantidad_fotos: mesa.cantidad_fotos,
      max_fotos: MAX_FOTOS,
      limite_alcanzado: mesa.cantidad_fotos >= MAX_FOTOS,
      fotos: fotosResult.rows,
    });
  } catch (error) {
    console.error('Error getMesa:', error);
    return res.status(500).json({ error: 'Error al obtener la mesa.' });
  }
}

async function listMesas(_req, res) {
  try {
    const result = await db.query(
      `
        SELECT id, nombre, cantidad_fotos
        FROM mesas
        ORDER BY id ASC
      `
    );

    return res.json({
      mesas: result.rows.map((m) => ({
        ...m,
        max_fotos: MAX_FOTOS,
        limite_alcanzado: m.cantidad_fotos >= MAX_FOTOS,
      })),
    });
  } catch (error) {
    console.error('Error listMesas:', error);
    return res.status(500).json({ error: 'Error al listar mesas.' });
  }
}

/**
 * Subida atómica: SELECT FOR UPDATE + validación de límite
 * para evitar race conditions entre invitados de la misma mesa.
 */
async function subirFoto(req, res) {
  const mesaId = Number(req.params.id);

  if (!Number.isInteger(mesaId) || mesaId < 1 || mesaId > 10) {
    return res.status(400).json({ error: 'ID de mesa inválido. Debe ser 1–10.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ninguna foto.' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const mesaResult = await client.query(
      'SELECT id, nombre, cantidad_fotos FROM mesas WHERE id = $1 FOR UPDATE',
      [mesaId]
    );

    if (mesaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Mesa no encontrada.' });
    }

    const mesa = mesaResult.rows[0];

    if (mesa.cantidad_fotos >= MAX_FOTOS) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Esta mesa ya alcanzó el límite de fotos.',
        cantidad_fotos: mesa.cantidad_fotos,
        max_fotos: MAX_FOTOS,
      });
    }

    const uploadResult = await uploadBuffer(req.file.buffer, mesaId);

    const fotoResult = await client.query(
      `
        INSERT INTO fotos (mesa_id, url_cloudinary, public_id_cloudinary)
        VALUES ($1, $2, $3)
        RETURNING id, mesa_id, url_cloudinary, public_id_cloudinary, fecha_subida
      `,
      [mesaId, uploadResult.secure_url, uploadResult.public_id]
    );

    const updateResult = await client.query(
      `
        UPDATE mesas
        SET cantidad_fotos = cantidad_fotos + 1
        WHERE id = $1
        RETURNING cantidad_fotos
      `,
      [mesaId]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      mensaje: 'Foto subida correctamente.',
      foto: fotoResult.rows[0],
      cantidad_fotos: updateResult.rows[0].cantidad_fotos,
      max_fotos: MAX_FOTOS,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error subirFoto:', error);

    const cloudMsg = error?.message || '';
    if (
      cloudMsg.includes('Unknown API key') ||
      cloudMsg.includes('Invalid Signature') ||
      error?.http_code === 401
    ) {
      return res.status(503).json({
        error:
          'Cloudinary no está configurado. Revisa CLOUDINARY_* en backend/.env.',
      });
    }

    return res.status(500).json({
      error: 'No se pudo subir la foto. Intenta de nuevo.',
    });
  } finally {
    client.release();
  }
}

module.exports = {
  getMesa,
  listMesas,
  subirFoto,
};
