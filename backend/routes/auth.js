const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

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

    // La sesión durará 14 días.
    const expiresIn = 60 * 60 * 24 * 14 * 1000;

    try {
      const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });

      const options = { maxAge: expiresIn, httpOnly: true, secure: true };
      res.cookie('session', sessionCookie, options);
      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Error al crear la cookie de sesión:', error);
      res.status(401).send('Autenticación fallida.');
    }
  });

  /**
   * GET /api/auth/logout
   * Limpia la cookie de sesión y redirige al login.
   */
  router.get('/auth/logout', (req, res) => {
    res.clearCookie('session');
    // Usamos la ruta completa del frontend para la redirección.
    res.redirect('/gestor-reservas/index.html');
  });

  return router;
};