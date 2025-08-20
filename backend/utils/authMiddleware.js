const admin = require('firebase-admin');

/**
 * Middleware para verificar la cookie de sesión en cada solicitud a una ruta protegida.
 */
const checkSessionCookie = async (req, res, next) => {
  // 1. Obtener la cookie de la solicitud
  const sessionCookie = req.cookies.session || '';

  // Si no hay cookie, el acceso es no autorizado
  if (!sessionCookie) {
    return res.status(401).send('Acceso no autorizado: Se requiere sesión.');
  }

  try {
    // 2. Verificar que la cookie sea válida y no haya sido revocada
    const decodedClaims = await admin.auth().verifySessionCookie(
      sessionCookie,
      true // true para verificar si la sesión ha sido revocada
    );
    
    // 3. Guardar los datos del usuario en la solicitud para uso futuro
    req.user = decodedClaims;
    
    // 4. Si todo es correcto, permitir el paso a la siguiente función (la ruta de la API)
    next();
  } catch (error) {
    // Si la cookie es inválida (expirada, etc.), denegar el acceso
    console.error('Error al verificar la cookie de sesión:', error.code);
    res.status(401).send('Acceso no autorizado: Sesión inválida o expirada.');
  }
};

module.exports = {
  checkSessionCookie,
};