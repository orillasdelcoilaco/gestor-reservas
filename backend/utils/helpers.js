// backend/utils/helpers.js - CÓDIGO ACTUALIZADO

/**
 * Limpia y estandariza un número de teléfono.
 */
function cleanPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.toString().replace(/\s+/g, '').replace(/[-+]/g, '');
  if (cleaned.length === 9 && cleaned.startsWith('9')) {
    return `56${cleaned}`;
  }
  return cleaned;
}

/**
 * Corrige los nombres de las cabañas que vienen con errores comunes.
 */
function cleanCabanaName(cabanaName) {
    if (!cabanaName || typeof cabanaName !== 'string') return '';
    const normalizedName = cabanaName.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalizedName === 'cabaña 9 1') return 'cabaña 9';
    if (normalizedName === 'cabaña 10 1') return 'cabaña 10';
    return cabanaName.trim();
}

/**
 * Parsea diferentes formatos de fecha a un objeto Date de JavaScript.
 */
function parseDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date && !isNaN(dateValue)) return dateValue;
    if (typeof dateValue === 'number') {
        return new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0) + dateValue * 86400000);
    }
    if (typeof dateValue !== 'string') return null;
    let date;
    if (/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
        date = new Date(dateValue.substring(0, 10) + 'T00:00:00Z');
    } else if (/^\d{2}\/\d{2}\/\d{4}/.test(dateValue)) {
        const [day, month, year] = dateValue.split('/');
        date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    } else {
        date = new Date(dateValue);
    }
    if (!isNaN(date)) return date;
    return null;
}

/**
 * Parsea un valor de moneda (string o number) a un número flotante.
 */
function parseCurrency(value, currency = 'USD') {
    if (typeof value === 'number') return Math.round(value);
    if (typeof value !== 'string' || value.trim() === '') return 0;

    // --- INICIO DE LA MODIFICACIÓN ---
    if (currency === 'CLP') {
        // Tomamos solo la parte entera del número, antes del punto decimal.
        const integerPart = value.split('.')[0];
        // Luego, eliminamos cualquier caracter que no sea un dígito (como comas o símbolos de peso).
        const digitsOnly = integerPart.replace(/\D/g, '');
        return parseInt(digitsOnly, 10) || 0;
    }
    // --- FIN DE LA MODIFICACIÓN ---
    
    // La lógica para USD (que usa puntos como separador decimal) se mantiene igual.
    const numberString = value.replace(/[^\d.,]/g, '');
    const cleanedForFloat = numberString.replace(/,/g, '');
    return parseFloat(cleanedForFloat) || 0;
}


module.exports = {
  cleanPhoneNumber,
  cleanCabanaName,
  parseDate,
  parseCurrency
};