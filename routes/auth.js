const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Simple user store (bisa diganti DB nanti)
const users = [];

// Seed default admin dari .env
const defaultAdmin = {
  id: 1,
  username: process.env.ADMIN_USERNAME || 'admin',
  passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
  role: 'admin'
};
users.push(defaultAdmin);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username & password wajib diisi!' });
  }

  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: 'Username atau password salah!' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Username atau password salah!' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.SESSION_EXPIRE || '24h' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
    message: 'Login berhasil!'
  });
});

// POST /api/auth/verify
router.post('/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ valid: false });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: { id: decoded.id, username: decoded.username, role: decoded.role } });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// POST /api/auth/change-password (protected via middleware di atas)
const { authenticateToken } = require('../middleware/auth');
router.post('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Password lama salah!' });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  res.json({ message: 'Password berhasil diubah!' });
});

module.exports = router;
