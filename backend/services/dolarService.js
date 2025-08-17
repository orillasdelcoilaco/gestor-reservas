const admin = require('firebase-admin');
const csv = require('csv-parser');
const stream = require('stream');

// Mapeo de nombres de meses en español a su número (0-11)
const monthMap = {
  'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
  'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
};

/**
 * ACTUALIZACIÓN DIARIA
 * Verifica si el valor del dólar para el día de hoy existe en Firestore.
 * Si no existe, lo obtiene de una API y lo guarda.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 */
async function updateTodaysDolarValue(db) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const dolarRef = db.collection('valorDolar').doc(dateStr);

  const doc = await dolarRef.get();
  if (doc.exists) {
    console.log(`El valor del dólar para hoy (${dateStr}) ya existe en la base de datos.`);
    return;
  }

  console.log(`Valor para hoy (${dateStr}) no encontrado. Actualizando desde la API...`);
  try {
    const apiUrl = `https://api.frankfurter.app/latest?from=USD&to=CLP`;
    const response = await fetch(apiUrl);
    if (response.ok) {
      const data = await response.json();
      const valor = data.rates.CLP;
      if (valor) {
        await dolarRef.set({
          valor: valor,
          fecha: admin.firestore.Timestamp.fromDate(new Date(dateStr + 'T00:00:00Z')),
        });
        console.log(`Valor de hoy (${valor}) guardado exitosamente en Firestore.`);
      }
    } else {
      console.error(`No se pudo obtener el valor de hoy desde la API. Status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error al actualizar el valor del dólar de hoy:', error.message);
  }
}

/**
 * PROCESAMIENTO DE CSV TIPO MATRIZ (VERSIÓN ROBUSTA)
 * Lee un buffer de archivo CSV con formato de matriz (Día/Mes) y lo guarda en Firestore.
 * @param {admin.firestore.Firestore} db - La instancia de Firestore.
 * @param {Buffer} buffer - El buffer del archivo CSV.
 * @param {number} year - El año correspondiente a los datos del archivo.
 * @returns {Promise<Object>} Un resumen del proceso.
 */
function processDolarCsv(db, buffer, year) {
  return new Promise((resolve, reject) => {
    const recordsToSave = [];
    console.log('Iniciando procesamiento de CSV. Leyendo stream...');

    const readableStream = new stream.Readable();
    readableStream._read = () => {};
    readableStream.push(buffer);
    readableStream.push(null);

    readableStream
      .pipe(csv({ separator: ';' }))
      .on('data', (row) => {
        const keys = Object.keys(row);
        if (keys.length < 2) return;

        const dayHeader = keys[0];
        const day = parseInt(row[dayHeader]);

        if (isNaN(day)) return; 

        for (let i = 1; i < keys.length; i++) {
          const monthName = keys[i];
          const monthKey = monthName.trim().toLowerCase().substring(0, 3);
          const monthIndex = monthMap[monthKey];

          if (monthIndex !== undefined) {
            const valorStr = row[monthName];
            if (valorStr && valorStr.trim() !== '') {
              const valor = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
              if (!isNaN(valor)) {
                const fecha = new Date(Date.UTC(year, monthIndex, day));
                if (fecha.getUTCMonth() === monthIndex) {
                  recordsToSave.push({ fecha, valor });
                }
              }
            }
          }
        }
      })
      .on('end', async () => {
        console.log(`Lectura de CSV finalizada. Se encontraron ${recordsToSave.length} registros válidos para guardar.`);
        if (recordsToSave.length === 0) {
          return resolve({ processed: 0, errors: 0, message: "No se encontraron registros válidos en el archivo." });
        }
        
        console.log(`Iniciando guardado de ${recordsToSave.length} registros en Firestore...`);
        const batch = db.batch();
        
        recordsToSave.forEach(record => {
          const dateId = record.fecha.toISOString().split('T')[0];
          const docRef = db.collection('valorDolar').doc(dateId);
          batch.set(docRef, {
            valor: record.valor,
            fecha: admin.firestore.Timestamp.fromDate(record.fecha),
          });
        });

        try {
          await batch.commit();
          console.log('Batch commit exitoso.');
          resolve({ processed: recordsToSave.length, errors: 0 });
        } catch (error) {
          console.error("Error al hacer batch commit:", error);
          reject(error);
        }
      })
      .on('error', (error) => {
        console.error('Error en el stream del CSV:', error);
        reject(error);
      });
  });
}

/**
 * OBTENCIÓN DE VALOR PARA CONSOLIDACIÓN (LÓGICA MEJORADA)
 * Obtiene el valor del dólar para una fecha. Si no existe, busca el del día anterior más cercano.
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

    // Si no se encuentra, buscar el valor en la fecha más cercana anterior a la solicitada.
    console.warn(`Valor para ${dateStr} no encontrado. Buscando el valor anterior más cercano...`);
    const q = db.collection('valorDolar')
      .where('fecha', '<=', admin.firestore.Timestamp.fromDate(targetDate))
      .orderBy('fecha', 'desc')
      .limit(1);
      
    const snapshot = await q.get();

    if (!snapshot.empty) {
      const ultimoValor = snapshot.docs[0].data().valor;
      const fechaEncontrada = snapshot.docs[0].id;
      console.log(`Usando el valor de respaldo de la fecha ${fechaEncontrada}: ${ultimoValor}`);
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
  processDolarCsv,
  updateTodaysDolarValue, // Exportamos la nueva función
};
