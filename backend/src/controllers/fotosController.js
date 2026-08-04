const https = require('https');
const http = require('http');
const archiver = require('archiver');
const db = require('../config/db');
const { destroyImage } = require('../config/cloudinary');

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    client
      .get(url, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          return fetchBuffer(response.headers.location).then(resolve, reject);
        }

        if (response.statusCode !== 200) {
          return reject(
            new Error(`Error al descargar imagen: HTTP ${response.statusCode}`)
          );
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      })
      .on('error', reject);
  });
}

function extensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(jpe?g|png|webp)$/i);
    return match ? match[0].toLowerCase() : '.jpg';
  } catch {
    return '.jpg';
  }
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
          SELECT f.id, f.mesa_id, f.url_cloudinary, f.public_id_cloudinary,
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
          SELECT f.id, f.mesa_id, f.url_cloudinary, f.public_id_cloudinary,
                 f.fecha_subida, m.nombre AS mesa_nombre
          FROM fotos f
          JOIN mesas m ON m.id = f.mesa_id
          ORDER BY f.fecha_subida DESC
        `
      );
    }

    return res.json({ fotos: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Error listFotos:', error);
    return res.status(500).json({ error: 'Error al listar fotos.' });
  }
}

async function descargarZip(req, res) {
  try {
    const result = await db.query(
      `
        SELECT f.id, f.mesa_id, f.url_cloudinary, m.nombre AS mesa_nombre
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
        const buffer = await fetchBuffer(foto.url_cloudinary);
        contadores[foto.mesa_id] = (contadores[foto.mesa_id] || 0) + 1;
        const n = String(contadores[foto.mesa_id]).padStart(2, '0');
        const ext = extensionFromUrl(foto.url_cloudinary);
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

async function eliminarFoto(req, res) {
  const fotoId = Number(req.params.id);

  if (!Number.isInteger(fotoId) || fotoId < 1) {
    return res.status(400).json({ error: 'ID de foto inválido.' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const fotoResult = await client.query(
      'SELECT id, mesa_id, public_id_cloudinary FROM fotos WHERE id = $1 FOR UPDATE',
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
      await destroyImage(foto.public_id_cloudinary);
    } catch (cloudErr) {
      console.warn('Foto borrada en DB pero no en Cloudinary:', cloudErr.message);
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
  eliminarFoto,
};
