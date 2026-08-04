import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function getMesa(id) {
  const { data } = await api.get(`/mesas/${id}`);
  return data;
}

export async function getMesas() {
  const { data } = await api.get('/mesas');
  return data;
}

export async function subirFoto(mesaId, file, onUploadProgress) {
  const formData = new FormData();
  formData.append('foto', file);

  const { data } = await api.post(`/mesas/${mesaId}/fotos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
    timeout: 120000,
  });

  return data;
}

export async function loginAdmin(usuario, password) {
  const { data } = await api.post('/admin/login', { usuario, password });
  return data;
}

export async function getFotos(mesaId) {
  const params = mesaId ? { mesa_id: mesaId } : undefined;
  const { data } = await api.get('/fotos', { params });
  return data;
}

export async function eliminarFoto(id) {
  const { data } = await api.delete(`/fotos/${id}`);
  return data;
}

export async function descargarZip() {
  const response = await api.get('/fotos/zip', {
    responseType: 'blob',
    timeout: 300000,
  });
  return response.data;
}

export default api;
