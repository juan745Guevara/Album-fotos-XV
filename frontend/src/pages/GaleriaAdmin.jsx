import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  descargarZip,
  eliminarFoto,
  getFotos,
  getMesas,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import MesaQr from '../components/MesaQr';
import './GaleriaAdmin.css';

export default function GaleriaAdmin() {
  const { isAuthenticated, logout } = useAuth();
  const [vista, setVista] = useState('mesas');
  const [mesas, setMesas] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError('');
      try {
        const [mesasData, fotosData] = await Promise.all([
          getMesas(),
          getFotos(),
        ]);
        if (cancelled) return;
        setMesas(mesasData.mesas || []);
        setFotos(fotosData.fotos || []);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 401) {
          logout();
          return;
        }
        setError(err.response?.data?.error || 'Error al cargar la galería.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, logout]);

  const fotosFiltradas = useMemo(() => {
    if (vista === 'general') return fotos;
    if (!mesaSeleccionada) return [];
    return fotos.filter((f) => f.mesa_id === mesaSeleccionada);
  }, [vista, fotos, mesaSeleccionada]);

  const totalFotos = fotos.length;
  const mesaActiva = mesas.find((m) => m.id === mesaSeleccionada);

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [mesasData, fotosData] = await Promise.all([
        getMesas(),
        getFotos(),
      ]);
      setMesas(mesasData.mesas || []);
      setFotos(fotosData.fotos || []);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        return;
      }
      setError(err.response?.data?.error || 'Error al cargar la galería.');
    } finally {
      setLoading(false);
    }
  }

  async function handleZip() {
    setDownloading(true);
    setError('');
    try {
      const blob = await descargarZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `album-evento-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo descargar el ZIP.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete(fotoId) {
    const ok = window.confirm('¿Eliminar esta foto? Esta acción no se puede deshacer.');
    if (!ok) return;

    setDeletingId(fotoId);
    setError('');
    try {
      await eliminarFoto(fotoId);
      setFotos((prev) => prev.filter((f) => f.id !== fotoId));
      setMesas((prev) =>
        prev.map((m) => {
          const foto = fotos.find((f) => f.id === fotoId);
          if (!foto || m.id !== foto.mesa_id) return m;
          return {
            ...m,
            cantidad_fotos: Math.max(m.cantidad_fotos - 1, 0),
            limite_alcanzado: false,
          };
        })
      );
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar la foto.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="admin-page starfield">
      <header className="admin-header">
        <div>
          <p className="admin-brand">Mis XV</p>
          <h1>Panel administrativo</h1>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="btn btn-secondary admin-btn-refresh"
            onClick={loadData}
            disabled={loading}
          >
            Actualizar
          </button>
          <button
            type="button"
            className="btn btn-ghost admin-btn-logout"
            onClick={logout}
          >
            Salir
          </button>
        </div>
      </header>

      <div className="admin-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'mesas'}
          className={vista === 'mesas' ? 'active' : ''}
          onClick={() => setVista('mesas')}
        >
          Vista por mesa
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'general'}
          className={vista === 'general' ? 'active' : ''}
          onClick={() => {
            setVista('general');
            setMesaSeleccionada(null);
          }}
        >
          Vista general
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {loading ? (
        <p className="admin-status">Cargando…</p>
      ) : (
        <>
          {vista === 'mesas' && (
            <section className="admin-mesas-view">
              <div className="admin-mesas-list">
                {mesas.map((mesa) => (
                  <button
                    key={mesa.id}
                    type="button"
                    className={`admin-mesa-item ${
                      mesaSeleccionada === mesa.id ? 'selected' : ''
                    }`}
                    onClick={() => setMesaSeleccionada(mesa.id)}
                  >
                    <span className="admin-mesa-name">{mesa.nombre}</span>
                    <span className="admin-mesa-count">
                      {mesa.cantidad_fotos}/{mesa.max_fotos}
                    </span>
                  </button>
                ))}
              </div>

              <div className="admin-mesa-detail">
                {!mesaSeleccionada ? (
                  <p className="admin-status">
                    Selecciona una mesa para ver su QR y fotos.
                  </p>
                ) : (
                  <>
                    <div className="admin-detail-head">
                      <h2>{mesaActiva?.nombre}</h2>
                      <p>
                        {mesaActiva?.cantidad_fotos}/{mesaActiva?.max_fotos}{' '}
                        fotos
                      </p>
                    </div>

                    <MesaQr
                      mesaId={mesaSeleccionada}
                      mesaNombre={mesaActiva?.nombre}
                    />

                    <h3 className="admin-photos-title">Fotos de la mesa</h3>
                    <PhotoGrid
                      fotos={fotosFiltradas}
                      onDelete={handleDelete}
                      deletingId={deletingId}
                      emptyText="Esta mesa aún no tiene fotos."
                    />
                  </>
                )}
              </div>
            </section>
          )}

          {vista === 'general' && (
            <section className="admin-general-view">
              <div className="admin-general-toolbar">
                <p>
                  Todas las fotos del evento · <strong>{totalFotos}</strong>
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleZip}
                  disabled={downloading || totalFotos === 0}
                >
                  {downloading ? 'Preparando ZIP…' : 'Descargar todo (ZIP)'}
                </button>
              </div>
              <PhotoGrid
                fotos={fotosFiltradas}
                onDelete={handleDelete}
                deletingId={deletingId}
                emptyText="Todavía no hay fotos subidas."
                showMesa
              />
            </section>
          )}
        </>
      )}

      <p className="admin-footer">
        <Link to="/admin/login">Admin</Link>
      </p>
    </div>
  );
}

function PhotoGrid({ fotos, onDelete, deletingId, emptyText, showMesa }) {
  if (!fotos.length) {
    return <p className="admin-status">{emptyText}</p>;
  }

  return (
    <div className="admin-grid">
      {fotos.map((foto) => (
        <figure key={foto.id} className="admin-photo">
          <a href={foto.url_cloudinary} target="_blank" rel="noreferrer">
            <img src={foto.url_cloudinary} alt={`Foto ${foto.id}`} loading="lazy" />
          </a>
          <figcaption>
            {showMesa && <span>{foto.mesa_nombre || `Mesa ${foto.mesa_id}`}</span>}
            <button
              type="button"
              className="btn-delete"
              onClick={() => onDelete(foto.id)}
              disabled={deletingId === foto.id}
            >
              {deletingId === foto.id ? '…' : 'Eliminar'}
            </button>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
