const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { checkSessionCookie } = require('../utils/authMiddleware');

module.exports = (db) => {
  router.post('/auth/login', async (req, res) => {
    const idToken = req.body.idToken;
    if (!idToken) {
      return res.status(401).send('Token no proporcionado.');
    }
    const expiresIn = 60 * 60 * 24 * 14 * 1000; // 14 días
    try {
      const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
      
      // --- LÍNEA CORREGIDA Y DEFINITIVA ---
      // Añadimos el atributo 'domain' para autorizar el dominio principal.
      const options = { 
        maxAge: expiresIn, 
        httpOnly: true, 
        secure: true, 
        path: '/', 
        sameSite: 'none',
        domain: 'orillasdelcoilaco.cl' // <-- ESTA ES LA CLAVE
      };
      
      res.cookie('session', sessionCookie, options);
      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Error al crear la cookie de sesión:', error);
      res.status(401).send('Autenticación fallida.');
    }
  });

  router.get('/auth/logout', (req, res) => {
    // Para borrar la cookie, también debemos especificar el dominio.
    res.clearCookie('session', { path: '/', domain: 'orillasdelcoilaco.cl' });
    res.redirect('/gestor-reservas/index.html');
  });

  router.get('/auth/status', checkSessionCookie, (req, res) => {
    res.status(200).json({
      status: 'active',
      email: req.user.email,
    });
  });

  return router;
};