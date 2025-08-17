const admin = require('firebase-admin');

/**
 * Formatea un objeto Date a una cadena YYYY-MM-DD en UTC.
 * @param {Date} date - El objeto Date a formatear.
 * @returns {string} La fecha formateada.
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Obtiene el valor del dólar para una fecha específica.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @param {Date} targetDate - La fecha para la cual se busca el valor del dólar.
 * @returns {Promise<number>} El valor del dólar para la fecha dada.
 */
async function getValorDolar(db, targetDate) {
  // Asegura que targetDate sea un objeto Date válido
  if (!(targetDate instanceof Date) || isNaN(targetDate)) {
    console.error('Fecha objetivo inválida recibida:', targetDate);
    const snapshot = await db.collection('valorDolar').orderBy('fecha', 'desc').limit(1).get();
    if (!snapshot.empty) return snapshot.docs[0].data().valor;
    return 950; // Último recurso
  }

  const dateStr = formatDate(targetDate);
  const dolarRef = db.collection('valorDolar').doc(dateStr);

  try {
    const doc = await dolarRef.get();
    if (doc.exists && doc.data().valor) {
      console.log(`Valor del dólar para ${dateStr} encontrado en Firestore: ${doc.data().valor}`);
      return doc.data().valor;
    }

    // Crea una fecha 'hoy' con la hora reseteada a medianoche UTC para una comparación precisa
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let queryDateStr;
    // Compara los objetos Date directamente para evitar problemas de strings/zonas horarias
    if (targetDate > today) {
      console.log(`La fecha ${dateStr} es futura. Se usará el valor más reciente disponible.`);
      queryDateStr = 'latest';
    } else {
      queryDateStr = dateStr;
    }
    
    console.log(`Valor para ${dateStr} no encontrado en Firestore. Consultando API externa para la fecha: ${queryDateStr}...`);
    const apiUrl = `https://api.frankfurter.app/${queryDateStr}?from=USD&to=CLP`;
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`La API no respondió correctamente. Status: ${response.status}`);
    }
    const data = await response.json();
    const valor = data.rates.CLP;

    if (!valor) {
      throw new Error('La respuesta de la API no contiene el valor para CLP.');
    }

    // Guardamos el valor en Firestore usando la fecha original solicitada como ID
    console.log(`API respondió con valor ${valor}. Guardando en Firestore bajo la fecha ${dateStr}.`);

    await dolarRef.set({
      valor: valor,
      // Guardamos la fecha como Timestamp a medianoche UTC
      fecha: admin.firestore.Timestamp.fromDate(new Date(dateStr + 'T00:00:00Z')),
    });
    
    return valor;

  } catch (error) {
    console.error(`Error obteniendo valor del dólar para ${dateStr}: ${error.message}. Intentando buscar el valor más reciente...`);
    
    const snapshot = await db.collection('valorDolar').orderBy('fecha', 'desc').limit(1).get();
    if (!snapshot.empty) {
      const ultimoValor = snapshot.docs[0].data().valor;
      console.log(`Usando el último valor de respaldo encontrado: ${ultimoValor}`);
      return ultimoValor;
    }

    const valorPorDefecto = 950;
    console.error(`No se encontró ningún valor de respaldo. Usando valor por defecto: ${valorPorDefecto}`);
    return valorPorDefecto;
  }
}

module.exports = {
  getValorDolar,
};