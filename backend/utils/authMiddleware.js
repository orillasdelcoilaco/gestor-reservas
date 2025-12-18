const admin = require('firebase-admin');

/**
 * Middleware para verificar un token de ID de Firebase enviado en el encabezado de autorización.
 */
const checkFirebaseToken = async (req, res, next) => {
  // --- NUEVO LOG AÑADIDO ---
  console.log(`[AuthMiddleware] Verificando token para la ruta: ${req.originalUrl}`);

  // 1. Buscar el token en el encabezado 'Authorization'
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    console.log('[AuthMiddleware] Acceso denegado: No se encontró el encabezado "Bearer".');
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado o con formato incorrecto.' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // 2. Verificar que el token sea válido
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // 3. Guardar los datos del usuario en la solicitud para uso futuro
    req.user = decodedToken;

    // 4. Si todo es correcto, permitir el paso
    console.log(`[AuthMiddleware] Token válido para el usuario: ${decodedToken.email}`);
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error al verificar el token de Firebase:', error);
    res.status(401).json({ error: 'Acceso no autorizado: Token inválido o expirado.' });
  }
};

module.exports = {
  checkFirebaseToken,
};