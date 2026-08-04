import { useEffect, useState } from 'react';
import { generarQrConLogo } from '../utils/qrConLogo';

function mesaUrl(mesaId) {
  const base = (
    import.meta.env.VITE_PUBLIC_URL || window.location.origin
  ).replace(/\/$/, '');
  return `${base}/mesa/${mesaId}`;
}

export default function MesaQr({ mesaId, mesaNombre }) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');
  const url = mesaUrl(mesaId);

  useEffect(() => {
    let cancelled = false;

    generarQrConLogo(url, 420)
      .then((result) => {
        if (!cancelled) {
          setDataUrl(result);
          setError('');
        }
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo generar el QR.');
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  function descargar() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${(mesaNombre || `mesa-${mesaId}`)
      .toLowerCase()
      .replace(/\s+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="mesa-qr">
      <div className="mesa-qr-preview">
        {dataUrl ? (
          <img src={dataUrl} alt={`Código QR de ${mesaNombre || `Mesa ${mesaId}`}`} />
        ) : (
          <p className="admin-status">{error || 'Generando QR…'}</p>
        )}
      </div>
      <div className="mesa-qr-info">
        <p className="mesa-qr-label">Enlace del QR</p>
        <a className="mesa-qr-link" href={url} target="_blank" rel="noreferrer">
          {url}
        </a>
        <button
          type="button"
          className="btn btn-primary"
          onClick={descargar}
          disabled={!dataUrl}
        >
          Descargar QR
        </button>
      </div>
    </div>
  );
}
