/**
 * Limpia y estandariza un número de teléfono.
 * - Elimina espacios, guiones y signos de más.
 * - Convierte los números móviles de Chile al formato internacional E.164 (ej: 569...).
 * @param {string | number | null} phone - El número de teléfono de entrada.
 * @returns {string | null} El número de teléfono limpio o null si la entrada no es válida.
 */
function cleanPhoneNumber(phone) {
  if (!phone) return null;

  // Elimina espacios, guiones y el signo '+'
  let cleaned = phone.toString().replace(/\s+/g, '').replace(/[-+]/g, '');

  // Si es un número chileno de 9 dígitos que empieza con 9, añade el prefijo 56
  if (cleaned.length === 9 && cleaned.startsWith('9')) {
    return `56${cleaned}`;
  }

  return cleaned;
}

module.exports = {
  cleanPhoneNumber,
};