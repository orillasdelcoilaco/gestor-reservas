const admin = require('firebase-admin');

/**
 * Formatea un objeto Date a una cadena YYYY-MM-DD.
 * @param {Date} date - El objeto Date a formatear.
 * @returns {string} La fecha formateada.
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Obtiene el valor del dólar para una fecha específica.
 * Primero busca en Firestore. Si no lo encuentra, consulta una API externa.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @param {Date} targetDate - La fecha para la cual se busca el valor del dólar.
 * @returns {Promise<number>} El valor del dólar para la fecha dada.
 */
async function getValorDolar(db, targetDate) {
  const dateStr = formatDate(targetDate);
  const dolarRef = db.collection('valorDolar').doc(dateStr);

  try {
    // 1. Intentar obtener el valor desde Firestore
    const doc = await dolarRef.get();
    if (doc.exists && doc.data().valor) {
      console.log(`Valor del dólar para ${dateStr} encontrado en Firestore: ${doc.data().valor}`);
      return doc.data().valor;
    }

    // 2. Si no está en Firestore, obtenerlo de la API
    console.log(`Valor para ${dateStr} no encontrado en Firestore. Consultando API externa...`);
    const apiUrl = `https://api.exchangerate-api.com/v4/latest/USD`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error('La API de tipo de cambio no respondió correctamente.');
    }
    const data = await response.json();
    const valor = data.rates.CLP;

    if (!valor) {
        throw new Error('La respuesta de la API no contiene el valor para CLP.');
    }

    // 3. Guardar el nuevo valor en Firestore para futuras consultas
    await dolarRef.set({
      valor: valor,
      fecha: admin.firestore.Timestamp.fromDate(targetDate),
    });
    console.log(`Nuevo valor del dólar para ${dateStr} guardado en Firestore: ${valor}`);
    return valor;

  } catch (error) {
    console.error(`Error obteniendo valor del dólar para ${dateStr}: ${error.message}. Intentando buscar el valor más reciente...`);
    
    // 4. Si todo falla, buscar el valor más reciente guardado en Firestore
    const snapshot = await db.collection('valorDolar')
      .orderBy('fecha', 'desc')
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const ultimoValor = snapshot.docs[0].data().valor;
      console.log(`Usando el último valor de respaldo encontrado: ${ultimoValor}`);
      return ultimoValor;
    }

    // 5. Como último recurso, si no hay nada en la base de datos
    console.error('No se encontró ningún valor de respaldo en Firestore.');
    throw new Error('No se pudo obtener el valor del dólar desde ninguna fuente.');
  }
}

module.exports = {
  getValorDolar,
};
