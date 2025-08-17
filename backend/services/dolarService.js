const admin = require('firebase-admin');

/**
 * Pausa la ejecución durante un número determinado de milisegundos.
 * @param {number} ms - Milisegundos para esperar.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Formatea un objeto Date a una cadena YYYY-MM-DD en UTC.
 * @param {Date} date - El objeto Date a formatear.
 * @returns {string} La fecha formateada.
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * PRECARGA DE DATOS HISTÓRICOS
 * Obtiene todos los valores del dólar desde una fecha de inicio hasta hoy y los guarda en Firestore.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 */
async function preloadDollarValues(db) {
  console.log('Iniciando precarga de valores históricos del dólar...');
  const startDate = new Date('2022-01-01T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let currentDate = startDate;
  while (currentDate <= today) {
    const dateStr = formatDate(currentDate);
    const dolarRef = db.collection('valorDolar').doc(dateStr);

    try {
      const doc = await dolarRef.get();
      if (doc.exists) {
        console.log(`Valor para ${dateStr} ya existe. Omitiendo.`);
      } else {
        const apiUrl = `https://api.frankfurter.app/${dateStr}?from=USD&to=CLP`;
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          const valor = data.rates.CLP;
          if (valor) {
            await dolarRef.set({
              valor: valor,
              fecha: admin.firestore.Timestamp.fromDate(new Date(dateStr + 'T00:00:00Z')),
            });
            console.log(`Valor ${valor} para ${dateStr} guardado exitosamente.`);
          }
        } else {
          console.warn(`No se pudo obtener el valor para ${dateStr}. Status: ${response.status}`);
        }
        // Pausa de 100ms para no sobrecargar la API
        await sleep(100);
      }
    } catch (error) {
      console.error(`Error procesando la fecha ${dateStr}:`, error.message);
    }
    // Avanzar al día siguiente
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  console.log('--- Proceso de precarga finalizado. ---');
}

/**
 * OBTENCIÓN DE VALOR PARA CONSOLIDACIÓN
 * Obtiene el valor del dólar para una fecha específica desde Firestore.
 * Si la fecha es futura, devuelve el valor más reciente disponible.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @param {Date} targetDate - La fecha para la cual se busca el valor del dólar.
 * @returns {Promise<number>} El valor del dólar para la fecha dada.
 */
async function getValorDolar(db, targetDate) {
  if (!(targetDate instanceof Date) || isNaN(targetDate)) {
    console.error('Fecha objetivo inválida:', targetDate);
    return 950; // Valor de respaldo
  }

  const dateStr = formatDate(targetDate);
  const dolarRef = db.collection('valorDolar').doc(dateStr);

  try {
    const doc = await dolarRef.get();
    if (doc.exists && doc.data().valor) {
      //console.log(`Valor para ${dateStr} encontrado en Firestore: ${doc.data().valor}`);
      return doc.data().valor;
    }

    // Si no se encuentra (porque es una fecha futura o la precarga no ha llegado a ese día),
    // buscamos el valor más reciente guardado en la base de datos.
    console.warn(`Valor para ${dateStr} no encontrado. Buscando el más reciente...`);
    const snapshot = await db.collection('valorDolar').orderBy('fecha', 'desc').limit(1).get();

    if (!snapshot.empty) {
      const ultimoValor = snapshot.docs[0].data().valor;
      console.log(`Usando el último valor de respaldo encontrado: ${ultimoValor}`);
      return ultimoValor;
    }

    // Como último recurso, si la base de datos está completamente vacía.
    const valorPorDefecto = 950;
    console.error('No se encontró ningún valor de respaldo. Usando valor por defecto.');
    return valorPorDefecto;

  } catch (error) {
    console.error(`Error crítico obteniendo valor del dólar para ${dateStr}: ${error.message}`);
    return 950; // Retornar valor de respaldo en caso de error grave.
  }
}

module.exports = {
  getValorDolar,
  preloadDollarValues, // Exportamos la nueva función
};