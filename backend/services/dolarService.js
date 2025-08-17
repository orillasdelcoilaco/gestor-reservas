const admin = require('firebase-admin');
const csv = require('csv-parser');
const stream = require('stream');

/**
 * Parsea una fecha en formato DD/MM/YYYY a un objeto Date en UTC.
 * @param {string} dateString - La fecha como texto (ej: "15/07/2024").
 * @returns {Date|null} Un objeto Date o null si el formato es inválido.
 */
function parseDate(dateString) {
  const parts = dateString.split('/');
  if (parts.length === 3) {
    // new Date(year, monthIndex, day)
    const date = new Date(Date.UTC(parts[2], parts[1] - 1, parts[0]));
    if (!isNaN(date)) {
      return date;
    }
  }
  return null;
}

/**
 * PROCESAMIENTO DE CSV
 * Lee un buffer de archivo CSV, lo parsea y guarda los valores en Firestore.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @param {Buffer} buffer - El buffer del archivo CSV.
 * @returns {Promise<Object>} Un resumen del proceso.
 */
function processDolarCsv(db, buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const readableStream = new stream.Readable();
    readableStream._read = () => {}; // Implementación vacía necesaria
    readableStream.push(buffer);
    readableStream.push(null);

    readableStream
      .pipe(csv({ separator: ';' })) // Especificamos que el separador es punto y coma
      .on('data', (data) => {
        // Limpieza y validación de cada fila
        const fechaStr = data.Dia;
        const valorStr = data.Valor;

        if (fechaStr && valorStr) {
          const fecha = parseDate(fechaStr);
          const valor = parseFloat(valorStr.replace('.', '').replace(',', '.'));

          if (fecha && !isNaN(valor)) {
            results.push({ fecha, valor });
          }
        }
      })
      .on('end', async () => {
        if (results.length === 0) {
          return resolve({ processed: 0, errors: 0 });
        }
        
        console.log(`Procesando ${results.length} registros del CSV...`);
        const batch = db.batch();
        
        results.forEach(record => {
          const dateId = record.fecha.toISOString().split('T')[0]; // Formato YYYY-MM-DD
          const docRef = db.collection('valorDolar').doc(dateId);
          batch.set(docRef, {
            valor: record.valor,
            fecha: admin.firestore.Timestamp.fromDate(record.fecha),
          });
        });

        try {
          await batch.commit();
          console.log('Batch commit exitoso.');
          resolve({ processed: results.length, errors: 0 });
        } catch (error) {
          console.error("Error al hacer batch commit:", error);
          reject(error);
        }
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * OBTENCIÓN DE VALOR PARA CONSOLIDACIÓN
 * Obtiene el valor del dólar para una fecha específica desde Firestore.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @param {Date} targetDate - La fecha para la cual se busca el valor del dólar.
 * @returns {Promise<number>} El valor del dólar para la fecha dada.
 */
async function getValorDolar(db, targetDate) {
  if (!(targetDate instanceof Date) || isNaN(targetDate)) {
    console.error('Fecha objetivo inválida:', targetDate);
    return 950;
  }

  const dateStr = targetDate.toISOString().split('T')[0];
  const dolarRef = db.collection('valorDolar').doc(dateStr);

  try {
    const doc = await dolarRef.get();
    if (doc.exists && doc.data().valor) {
      return doc.data().valor;
    }

    console.warn(`Valor para ${dateStr} no encontrado. Buscando el más reciente...`);
    const snapshot = await db.collection('valorDolar').orderBy('fecha', 'desc').limit(1).get();

    if (!snapshot.empty) {
      const ultimoValor = snapshot.docs[0].data().valor;
      console.log(`Usando el último valor de respaldo encontrado: ${ultimoValor}`);
      return ultimoValor;
    }

    const valorPorDefecto = 950;
    console.error('No se encontró ningún valor de respaldo. Usando valor por defecto.');
    return valorPorDefecto;

  } catch (error) {
    console.error(`Error crítico obteniendo valor del dólar para ${dateStr}: ${error.message}`);
    return 950;
  }
}

module.exports = {
  getValorDolar,
  processDolarCsv, // Exportamos la nueva función
};