import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import SubirFoto from './pages/SubirFoto';
import LoginAdmin from './pages/LoginAdmin';
import GaleriaAdmin from './pages/GaleriaAdmin';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/admin/login" replace />} />
          <Route path="/mesa/:id" element={<SubirFoto />} />
          <Route path="/admin/login" element={<LoginAdmin />} />
          <Route path="/admin" element={<GaleriaAdmin />} />
          <Route path="*" element={<Navigate to="/admin/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
