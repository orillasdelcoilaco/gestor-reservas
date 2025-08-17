const admin = require('firebase-admin');
const csv = require('csv-parser');
const stream = require('stream');

// Mapeo de nombres de meses en español a su número (0-11)
const monthMap = {
  'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
  'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
};

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
        // LÓGICA A PRUEBA DE ERRORES: LEER POR POSICIÓN, NO POR NOMBRE
        const keys = Object.keys(row);
        if (keys.length < 2) return; // Si la fila no tiene al menos día y un mes, la ignoramos.

        const dayHeader = keys[0]; // La primera columna siempre es el día
        const day = parseInt(row[dayHeader]);

        if (isNaN(day)) {
            // console.log(`Fila ignorada, valor de día no es un número:`, row[dayHeader]);
            return; 
        }

        // Iterar sobre el resto de las columnas (los meses)
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

// --- La función getValorDolar se mantiene exactamente igual ---
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
  processDolarCsv,
};
