require('dotenv').config();
const express = require('express');
const cors = require('cors');

const mesasRoutes = require('./routes/mesas');
const fotosRoutes = require('./routes/fotos');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, servicio: 'album-fotos-qr' });
});

app.use('/api/mesas', mesasRoutes);
app.use('/api/fotos', fotosRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// En local arranca el servidor; en Vercel la función serverless exporta la app.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`API escuchando en http://localhost:${PORT}`);
  });
}

module.exports = app;
