const db = require('../config/db');
const { uploadBuffer } = require('../config/s3');

const MAX_FOTOS = Number(process.env.MAX_FOTOS_POR_MESA) || 10;

function toAppImageUrl(fotoId) {
  return `/api/fotos/${fotoId}/archivo`;
}

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
        SELECT id, url_imagen, fecha_subida
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
      fotos: fotosResult.rows.map((foto) => ({
        ...foto,
        url_imagen: toAppImageUrl(foto.id),
      })),
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

    const uploadResult = await uploadBuffer(
      req.file.buffer,
      mesaId,
      req.file.mimetype,
      req.file.originalname
    );

    const fotoResult = await client.query(
      `
        INSERT INTO fotos (mesa_id, url_imagen, storage_key)
        VALUES ($1, $2, $3)
        RETURNING id, mesa_id, url_imagen, storage_key, fecha_subida
      `,
      [mesaId, uploadResult.url, uploadResult.key]
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

    const foto = fotoResult.rows[0];

    return res.status(201).json({
      mensaje: 'Foto subida correctamente.',
      foto: {
        ...foto,
        url_imagen: toAppImageUrl(foto.id),
      },
      cantidad_fotos: updateResult.rows[0].cantidad_fotos,
      max_fotos: MAX_FOTOS,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error subirFoto:', error);

    const storageMsg = error?.message || '';
    if (error?.code === 'S3_NOT_CONFIGURED' || storageMsg.includes('AWS_S3_BUCKET')) {
      return res.status(503).json({
        error: 'Amazon S3 no está configurado. Revisa AWS_S3_BUCKET y credenciales en backend/.env.',
      });
    }

    if (
      error?.name === 'CredentialsProviderError' ||
      error?.name === 'AccessDenied' ||
      storageMsg.includes('Access Denied')
    ) {
      return res.status(503).json({
        error: 'Sin permisos para subir a S3. Revisa AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY y la policy del usuario.',
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
