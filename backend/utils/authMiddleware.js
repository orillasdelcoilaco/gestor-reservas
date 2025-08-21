const admin = require('firebase-admin');

/**
 * Middleware para verificar la cookie de sesión en cada solicitud a una ruta protegida.
 */
const checkSessionCookie = async (req, res, next) => {
  const sessionCookie = req.cookies.session || '';

  // Si no hay cookie, el acceso es no autorizado.
  if (!sessionCookie) {
    // Para las páginas HTML, redirigimos al login.
    if (req.headers.accept.includes('text/html')) {
      return res.redirect('/gestor-reservas/index.html');
    }
    // Para las llamadas de API, enviamos un error.
    return res.status(401).json({ error: 'Acceso no autorizado: Se requiere sesión.' });
  }

  try {
    // Verificamos que la cookie sea válida y no haya sido revocada.
    const decodedClaims = await admin.auth().verifySessionCookie(
      sessionCookie,
      true // true para verificar si la sesión ha sido revocada.
    );
    
    // Guardamos los datos del usuario en la solicitud para uso futuro.
    req.user = decodedClaims;
    
    // Si todo es correcto, permitimos el paso a la siguiente función.
    next();
  } catch (error) {
    console.error('Error al verificar la cookie de sesión:', error.code);
    // Si la cookie es inválida, la limpiamos y redirigimos al login.
    res.clearCookie('session');
    if (req.headers.accept.includes('text/html')) {
      return res.redirect('/gestor-reservas/index.html');
    }
    return res.status(401).json({ error: 'Acceso no autorizado: Sesión inválida o expirada.' });
  }
};

module.exports = {
  checkSessionCookie,
};