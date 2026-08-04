const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

async function login(req, res) {
  const { usuario, password } = req.body || {};

  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuario y password son requeridos.' });
  }

  try {
    const result = await db.query(
      'SELECT id, usuario, password_hash FROM admins WHERE usuario = $1',
      [usuario]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const admin = result.rows[0];
    const ok = await bcrypt.compare(password, admin.password_hash);

    if (!ok) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      { id: admin.id, usuario: admin.usuario },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      admin: { id: admin.id, usuario: admin.usuario },
    });
  } catch (error) {
    console.error('Error login:', error);
    return res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
}

module.exports = { login };
