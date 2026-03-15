// backend/services/dolarService.js - CÓDIGO ACTUALIZADO Y MEJORADO

const admin = require('firebase-admin');
const csv = require('csv-parser');
const stream = require('stream');

// Mapeo de meses (sin cambios)
const monthMap = {
    'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
};

/**
 * ACTUALIZACIÓN DIARIA (API ROBUSTA)
 * Obtiene el valor del dólar para el día de hoy desde una API estable y lo guarda si no existe.
 */
async function updateTodaysDolarValue(db) {
    const today = new Date();
    const offset = today.getTimezoneOffset() + (180); // Ajuste a zona horaria de Chile (aprox GMT-3)
    const chileanDate = new Date(today.getTime() - offset * 60 * 1000);
    const dateStr = chileanDate.toISOString().split('T')[0];

    const dolarRef = db.collection('valorDolar').doc(dateStr);

    const doc = await dolarRef.get();
    if (doc.exists) {
        console.log(`El valor del dólar para hoy (${dateStr}) ya existe en la base de datos.`);
        return doc.data().valor; // Devolvemos el valor para usarlo si es necesario
    }

    console.log(`Valor para hoy (${dateStr}) no encontrado. Actualizando desde la nueva API...`);
    try {
        const apiUrl = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`;
        const response = await fetch(apiUrl);

        if (response.ok) {
            const data = await response.json();
            const valor = data.usd.clp;

            if (valor) {
                await dolarRef.set({
                    valor: valor,
                    fecha: admin.firestore.Timestamp.fromDate(new Date(dateStr + 'T00:00:00Z')),
                });
                console.log(`Valor de hoy (${valor}) guardado exitosamente en Firestore.`);
                return valor; // Devolvemos el nuevo valor
            } else {
                console.error(`No se pudo encontrar el valor CLP en la respuesta de la API.`);
            }
        } else {
            console.error(`No se pudo obtener el valor de hoy desde la API. Status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error al actualizar el valor del dólar de hoy:', error.message);
    }
    return null; // Devolvemos null si falla
}


/**
 * PROCESAMIENTO DE CSV (sin cambios)
 */
function processDolarCsv(db, buffer, year) {
    return new Promise((resolve, reject) => {
        const recordsToSave = [];
        const readableStream = new stream.Readable();
        readableStream._read = () => { };
        readableStream.push(buffer);
        readableStream.push(null);

        readableStream
            .pipe(csv({ separator: ';' }))
            .on('data', (row) => {
                const day = parseInt(row[Object.keys(row)[0]]);
                if (isNaN(day)) return;

                for (const monthName of Object.keys(row).slice(1)) {
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
                if (recordsToSave.length === 0) {
                    return resolve({ processed: 0, errors: 0, message: "No se encontraron registros válidos." });
                }
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
                    resolve({ processed: recordsToSave.length, errors: 0 });
                } catch (error) {
                    reject(error);
                }
            })
            .on('error', (error) => reject(error));
    });
}

/**
 * OBTENCIÓN DE VALOR PARA CONSOLIDACIÓN (LÓGICA MEJORADA)
 * Obtiene el valor del dólar para una fecha. Si no existe, busca el del día anterior,
 * lo guarda para la fecha faltante y lo devuelve. Para fechas futuras, usa el valor de hoy.
 */
async function getValorDolar(db, targetDate) {
    if (!(targetDate instanceof Date) || isNaN(targetDate)) {
        console.error('Fecha objetivo inválida:', targetDate);
        return 950; // Valor por defecto
    }

    // Normalizamos la fecha a medianoche UTC para evitar problemas de zona horaria
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const targetDateUTC = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
    const dateStr = targetDateUTC.toISOString().split('T')[0];

    // --- LÓGICA PARA FECHAS FUTURAS Y HOY ---
    if (targetDateUTC >= todayUTC) {
        console.log(`La fecha ${dateStr} es futura o es hoy. Usando el valor del dólar de hoy.`);
        // Primero, intentamos obtener el valor de hoy de la base de datos
        const todayStr = todayUTC.toISOString().split('T')[0];
        const todayDoc = await db.collection('valorDolar').doc(todayStr).get();
        if (todayDoc.exists) {
            return todayDoc.data().valor;
        }
        // Si no está, lo buscamos con la API
        const valorHoy = await updateTodaysDolarValue(db);
        return valorHoy || 950; // Usar valor de la API o un default si falla
    }

    // --- LÓGICA PARA FECHAS PASADAS Y PRESENTES ---
    const dolarRef = db.collection('valorDolar').doc(dateStr);
    try {
        const doc = await dolarRef.get();
        if (doc.exists && doc.data().valor) {
            return doc.data().valor;
        }

        // Si no se encuentra, buscar el valor en la fecha más cercana anterior.
        console.warn(`Valor para ${dateStr} no encontrado. Buscando el valor anterior más cercano...`);
        const q = db.collection('valorDolar')
            .where('fecha', '<=', admin.firestore.Timestamp.fromDate(targetDateUTC))
            .orderBy('fecha', 'desc')
            .limit(1);

        const snapshot = await q.get();

        if (!snapshot.empty) {
            const ultimoValor = snapshot.docs[0].data().valor;
            const fechaEncontrada = snapshot.docs[0].id;
            console.log(`Usando el valor de respaldo de la fecha ${fechaEncontrada}: ${ultimoValor}`);
            // No guardamos el valor de respaldo para no propagar un valor incorrecto a fechas sin datos.
            return ultimoValor;
        }

        // Si no hay ningún valor anterior, usar un default.
        const valorPorDefecto = 950;
        console.error('No se encontró ningún valor de respaldo. Usando valor por defecto.');
        return valorPorDefecto;

    } catch (error) {
        console.error(`Error crítico obteniendo valor del dólar para ${dateStr}: ${error.message}`);
        return 950; // Fallback final
    }
}

/**
 * Obtiene el valor del dólar para una fecha específica desde la API externa.
 * Intenta primero la URL con fecha exacta, luego el fallback de pages.dev.
 * @returns {number|null} El valor CLP/USD o null si falla.
 */
async function fetchDolarFromAPI(dateStr) {
    const urls = [
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/usd.json`,
        `https://${dateStr}.currency-api.pages.dev/v1/currencies/usd.json`,
    ];
    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const valor = data?.usd?.clp;
                if (valor) return valor;
            }
        } catch (e) {
            // Intenta la siguiente URL
        }
    }
    return null;
}

/**
 * REPARACIÓN MASIVA DE VALORES
 * Itera desde fromDateStr hasta toDateStr, consulta la API para cada fecha
 * y sobreescribe el valor en Firestore. Corrige el bug de propagación del valor fijo.
 * @param {object} db - Firestore instance
 * @param {string} fromDateStr - Fecha de inicio 'YYYY-MM-DD'
 * @param {string} toDateStr  - Fecha de fin 'YYYY-MM-DD' (por defecto hoy)
 * @returns {{ fixed: string[], failed: string[], total: number }}
 */
async function repairDolarValues(db, fromDateStr, toDateStr) {
    const from = new Date(fromDateStr + 'T00:00:00Z');
    const todayUTC = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const to = toDateStr ? new Date(toDateStr + 'T00:00:00Z') : todayUTC;

    if (isNaN(from) || isNaN(to) || from > to) {
        throw new Error('Rango de fechas inválido.');
    }

    const fixed = [];
    const failed = [];
    const batch = db.batch();
    let batchCount = 0;

    const current = new Date(from);
    while (current <= to) {
        const dateStr = current.toISOString().split('T')[0];
        const valor = await fetchDolarFromAPI(dateStr);

        if (valor) {
            const docRef = db.collection('valorDolar').doc(dateStr);
            batch.set(docRef, {
                valor,
                fecha: admin.firestore.Timestamp.fromDate(new Date(dateStr + 'T00:00:00Z')),
            });
            batchCount++;
            fixed.push({ date: dateStr, valor });

            // Firestore batch máximo 500 ops
            if (batchCount >= 450) {
                await batch.commit();
                batchCount = 0;
            }
        } else {
            failed.push(dateStr);
        }

        current.setUTCDate(current.getUTCDate() + 1);
        // Pequeña pausa para no saturar la API
        await new Promise(r => setTimeout(r, 80));
    }

    if (batchCount > 0) {
        await batch.commit();
    }

    return { fixed, failed, total: fixed.length + failed.length };
}

module.exports = {
    getValorDolar,
    processDolarCsv,
    updateTodaysDolarValue,
    repairDolarValues,
};