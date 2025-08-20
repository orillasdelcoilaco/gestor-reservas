const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { checkSessionCookie } = require('../utils/authMiddleware'); // Importamos el guardia

module.exports = (db) => {
  /**
   * POST /api/auth/login
   * Recibe un token de ID de Firebase, lo verifica y establece una cookie de sesión.
   */
  router.post('/auth/login', async (req, res) => {
    const idToken = req.body.idToken;
    if (!idToken) {
      return res.status(401).send('Token no proporcionado.');
    }

    const expiresIn = 60 * 60 * 24 * 14 * 1000; // 14 días

    try {
      const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
      const options = { maxAge: expiresIn, httpOnly: true, secure: process.env.RENDER === 'true' };
      res.cookie('session', sessionCookie, options);
      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Error al crear la cookie de sesión:', error);
      res.status(401).send('Autenticación fallida.');
    }
  });

  /**
   * GET /api/auth/logout
   * Limpia la cookie de sesión.
   */
  router.get('/auth/logout', (req, res) => {
    res.clearCookie('session');
    res.redirect('/gestor-reservas/index.html'); // Redirige al login
  });

  /**
   * GET /api/auth/status
   * Verifica la cookie de sesión y devuelve el estado del usuario. Ruta protegida.
   */
  router.get('/auth/status', checkSessionCookie, (req, res) => {
    // Si checkSessionCookie pasa, significa que el usuario está autenticado.
    // La información del usuario está en req.user gracias al middleware.
    res.status(200).json({
      status: 'active',
      email: req.user.email,
    });
  });

  return router;
};