import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { loginAdmin } from '../services/api';
import { useAuth } from '../context/AuthContext';
import cenicientaImg from '../assets/cenicienta.png';
import './LoginAdmin.css';

export default function LoginAdmin() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await loginAdmin(usuario.trim(), password);
      login(data.token, data.admin);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrap">
        <img
          src={cenicientaImg}
          alt=""
          className="login-cenicienta"
          aria-hidden="true"
        />

        <form className="login-card" onSubmit={handleSubmit}>
          <p className="login-brand">Mis XV</p>
          <h1>Panel admin</h1>
          <p className="login-copy">Album de fotos · acceso organizadores</p>

          <label>
            Usuario
            <input
              type="text"
              autoComplete="username"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
