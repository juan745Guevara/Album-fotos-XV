const path = require('path');
const archiver = require('archiver');
const db = require('../config/db');
const { deleteObject, getObjectBuffer, streamObject } = require('../config/s3');

function toAppImageUrl(fotoId) {
  return `/api/fotos/${fotoId}/archivo`;
}

function extensionFromKey(storageKey) {
  const ext = path.extname(storageKey || '').toLowerCase();
  if (/^\.(jpe?g|png|webp|heic|heif)$/.test(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  return '.jpg';
}

async function listFotos(req, res) {
  const mesaId = req.query.mesa_id ? Number(req.query.mesa_id) : null;

  if (req.query.mesa_id && (!Number.isInteger(mesaId) || mesaId < 1)) {
    return res.status(400).json({ error: 'mesa_id inválido.' });
  }

  try {
    let result;

    if (mesaId) {
      result = await db.query(
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
    } else {
      result = await db.query(
        `
          SELECT f.id, f.mesa_id, f.url_imagen, f.storage_key,
                 f.fecha_subida, m.nombre AS mesa_nombre
          FROM fotos f
          JOIN mesas m ON m.id = f.mesa_id
          ORDER BY f.fecha_subida DESC
        `
      );
    }

    return res.json({
      fotos: result.rows.map((foto) => ({
        ...foto,
        url_imagen: toAppImageUrl(foto.id),
      })),
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Error listFotos:', error);
    return res.status(500).json({ error: 'Error al listar fotos.' });
  }
}

async function descargarZip(req, res) {
  try {
    const result = await db.query(
      `
        SELECT f.id, f.mesa_id, f.url_imagen, f.storage_key, m.nombre AS mesa_nombre
        FROM fotos f
        JOIN mesas m ON m.id = f.mesa_id
        ORDER BY f.mesa_id ASC, f.fecha_subida ASC
      `
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No hay fotos para descargar.' });
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="album-evento-${timestamp}.zip"`
    );

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => {
      console.error('Error archiver:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error al generar el ZIP.' });
      } else {
        res.end();
      }
    });

    archive.pipe(res);

    const contadores = {};

    for (const foto of result.rows) {
      try {
        const buffer = await getObjectBuffer(foto.storage_key);
        contadores[foto.mesa_id] = (contadores[foto.mesa_id] || 0) + 1;
        const n = String(contadores[foto.mesa_id]).padStart(2, '0');
        const ext = extensionFromKey(foto.storage_key);
        const nombre = `mesa-${foto.mesa_id}/foto-${n}${ext}`;
        archive.append(buffer, { name: nombre });
      } catch (err) {
        console.warn(`No se pudo incluir foto ${foto.id}:`, err.message);
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error descargarZip:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Error al generar el ZIP.' });
    }
  }
}

async function servirArchivo(req, res) {
  const fotoId = Number(req.params.id);

  if (!Number.isInteger(fotoId) || fotoId < 1) {
    return res.status(400).json({ error: 'ID de foto inválido.' });
  }

  try {
    const result = await db.query(
      'SELECT id, storage_key FROM fotos WHERE id = $1',
      [fotoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Foto no encontrada.' });
    }

    await streamObject(result.rows[0].storage_key, res);
  } catch (error) {
    console.error('Error servirArchivo:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'No se pudo cargar la foto.' });
    }
  }
}

async function eliminarFoto(req, res) {
  const fotoId = Number(req.params.id);

  if (!Number.isInteger(fotoId) || fotoId < 1) {
    return res.status(400).json({ error: 'ID de foto inválido.' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const fotoResult = await client.query(
      'SELECT id, mesa_id, storage_key FROM fotos WHERE id = $1 FOR UPDATE',
      [fotoId]
    );

    if (fotoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Foto no encontrada.' });
    }

    const foto = fotoResult.rows[0];

    await client.query('DELETE FROM fotos WHERE id = $1', [fotoId]);
    await client.query(
      `
        UPDATE mesas
        SET cantidad_fotos = GREATEST(cantidad_fotos - 1, 0)
        WHERE id = $1
      `,
      [foto.mesa_id]
    );

    await client.query('COMMIT');

    try {
      await deleteObject(foto.storage_key);
    } catch (s3Err) {
      console.warn('Foto borrada en DB pero no en S3:', s3Err.message);
    }

    return res.json({ mensaje: 'Foto eliminada correctamente.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error eliminarFoto:', error);
    return res.status(500).json({ error: 'Error al eliminar la foto.' });
  } finally {
    client.release();
  }
}

module.exports = {
  listFotos,
  descargarZip,
  servirArchivo,
  eliminarFoto,
};
