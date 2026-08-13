import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getMesa, subirFoto } from '../services/api';
import './SubirFoto.css';

const MAX_RETRIES = 2;

export default function SubirFoto() {
  const { id } = useParams();
  const inputRef = useRef(null);

  const [mesa, setMesa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState('');

  async function loadMesa() {
    setLoading(true);
    setError('');
    try {
      const data = await getMesa(id);
      setMesa(data);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        'No pudimos cargar la mesa. Revisa tu conexión.';
      setError(msg);
      setMesa(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMesa();
  }, [id]);

  function clearPreview() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onSelectFile(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setSuccess('');
    setError('');

    if (
      !selected.type.startsWith('image/') &&
      !/\.heic$/i.test(selected.name) &&
      !/\.heif$/i.test(selected.name)
    ) {
      setError('Solo se permiten imágenes (jpg, png, webp, heic).');
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function uploadWithRetry(mesaId, foto) {
    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await subirFoto(mesaId, foto, (event) => {
          if (!event.total) return;
          setProgress(Math.round((event.loaded * 100) / event.total));
        });
      } catch (err) {
        lastError = err;
        if (err.response?.status === 409) throw err;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  async function handleUpload() {
    if (!file || !mesa || mesa.limite_alcanzado) return;

    setUploading(true);
    setProgress(0);
    setError('');
    setSuccess('');

    try {
      const result = await uploadWithRetry(mesa.id, file);

      setSuccess('¡Listo! Tu foto ya es parte de este cuento.');
      clearPreview();
      setMesa((prev) => ({
        ...prev,
        cantidad_fotos: result.cantidad_fotos,
        limite_alcanzado: result.cantidad_fotos >= result.max_fotos,
        fotos: [
          {
            id: result.foto.id,
            url_cloudinary: result.foto.url_cloudinary,
            fecha_subida: result.foto.fecha_subida,
          },
          ...(prev?.fotos || []),
        ],
      }));
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        'No se pudo subir. Revisa tu conexión e intenta de nuevo.';
      setError(msg);
      if (err.response?.status === 409) {
        await loadMesa();
      }
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  if (loading) {
    return (
      <div className="mesa-page starfield">
        <div className="mesa-shell">
          <p className="mesa-status">Cargando mesa…</p>
        </div>
      </div>
    );
  }

  if (!mesa) {
    return (
      <div className="mesa-page starfield">
        <div className="mesa-shell">
          <h1 className="mesa-brand">Mis XV</h1>
          <p className="mesa-error">{error || 'Mesa no encontrada.'}</p>
          <button type="button" className="btn btn-secondary" onClick={loadMesa}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const restantes = Math.max(mesa.max_fotos - mesa.cantidad_fotos, 0);

  return (
    <div className="mesa-page starfield">
      <div className="mesa-shell">
        <header className="mesa-header">
          <p className="mesa-brand">Mis XV</p>
          <h1 className="mesa-title">{mesa.nombre}</h1>
          <p className="mesa-subtitle">
            Un recuerdo de cuento · comparte desde tu mesa
          </p>
        </header>

        <div className="mesa-counter" aria-live="polite">
          <div className="mesa-counter-track">
            <div
              className="mesa-counter-fill"
              style={{
                width: `${(mesa.cantidad_fotos / mesa.max_fotos) * 100}%`,
              }}
            />
          </div>
          <p className="mesa-counter-text">
            <strong>{mesa.cantidad_fotos}</strong> de {mesa.max_fotos} fotos
            subidas
            {!mesa.limite_alcanzado && (
              <span> · quedan {restantes}</span>
            )}
          </p>
        </div>

        {mesa.limite_alcanzado ? (
          <div className="mesa-limit">
            <p>Esta mesa ya alcanzó el límite de fotos</p>
            <span>¡Gracias por participar!</span>
          </div>
        ) : (
          <section className="mesa-upload">
            {!preview ? (
              <>
                <label className="mesa-capture" htmlFor="foto-input">
                  <span className="mesa-capture-icon" aria-hidden="true">
                    +
                  </span>
                  <span className="mesa-capture-label">Tomar o elegir foto</span>
                  <span className="mesa-capture-hint">
                    Cámara o galería · calidad original · máx. 100MB
                  </span>
                </label>
                <input
                  id="foto-input"
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,image/*"
                  capture="environment"
                  onChange={onSelectFile}
                  hidden
                />
              </>
            ) : (
              <div className="mesa-preview">
                <img src={preview} alt="Vista previa" />
                <div className="mesa-preview-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={clearPreview}
                    disabled={uploading}
                  >
                    Cambiar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleUpload}
                    disabled={uploading}
                  >
                    {uploading ? `Subiendo… ${progress}%` : 'Confirmar subida'}
                  </button>
                </div>
                {uploading && (
                  <div className="mesa-progress" aria-hidden="true">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {success && <p className="mesa-success">{success}</p>}
        {error && <p className="mesa-error">{error}</p>}

        {mesa.fotos?.length > 0 && (
          <section className="mesa-gallery">
            <h2>Fotos de esta mesa</h2>
            <div className="mesa-grid">
              {mesa.fotos.map((foto) => (
                <a
                  key={foto.id}
                  href={foto.url_cloudinary}
                  target="_blank"
                  rel="noreferrer"
                  className="mesa-thumb"
                >
                  <img src={foto.url_cloudinary} alt={`Foto ${foto.id}`} loading="lazy" />
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
