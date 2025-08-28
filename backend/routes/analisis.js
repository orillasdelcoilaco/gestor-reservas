const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const stream = require('stream');

const upload = multer({ storage: multer.memoryStorage() });

// Función para definir la temporada basada en la fecha
function getTemporada(fecha) {
    const mes = fecha.getMonth() + 1; // getMonth() es 0-11
    const anio = fecha.getFullYear();
    // Temporada Alta: Diciembre, Enero, Febrero, Marzo
    if (mes >= 12 || mes <= 3) {
        // Ajuste para Diciembre que pertenece a la temporada del siguiente año
        const anioTemporada = mes === 12 ? anio + 1 : anio;
        return `Alta ${anioTemporada}`;
    } else {
        return `Baja ${anio}`;
    }
}

module.exports = (db) => {
    /**
     * POST /api/analizar-tarifas-historicas
     * Recibe un archivo CSV de Booking, lo cruza con las reservas existentes
     * y devuelve el análisis del precio MÁXIMO por cabaña y temporada.
     */
    router.post('/analizar-tarifas-historicas', upload.single('reporteFile'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
        }

        try {
            console.log('[Análisis Histórico] Iniciando proceso...');

            // 1. Cargar todas las reservas de Booking desde Firestore
            const reservasBookingDb = new Map();
            const snapshot = await db.collection('reservas').where('canal', '==', 'Booking').get();
            snapshot.forEach(doc => {
                const data = doc.data();
                reservasBookingDb.set(data.reservaIdOriginal, {
                    alojamiento: data.alojamiento,
                    fechaLlegada: data.fechaLlegada.toDate()
                });
            });
            console.log(`[Análisis Histórico] Se cargaron ${reservasBookingDb.size} reservas de Booking desde la base de datos.`);

            // 2. Procesar el archivo CSV subido
            const results = [];
            const readableStream = new stream.Readable();
            readableStream._read = () => {};
            readableStream.push(req.file.buffer);
            readableStream.push(null);

            await new Promise((resolve, reject) => {
                 readableStream
                    .pipe(csv())
                    .on('data', (data) => results.push(data))
                    .on('end', resolve)
                    .on('error', reject);
            });
            console.log(`[Análisis Histórico] Se leyeron ${results.length} filas del archivo CSV.`);

            // 3. Cruzar datos y calcular precios por noche
            const preciosPorNoche = [];
            for (const row of results) {
                const reservationNumber = row['Reservation number'];
                const originalAmount = parseFloat(row['Original amount']);
                const roomNights = parseInt(row['Room nights']);
                const status = row['Status'];

                if (reservationNumber && status === 'OK' && originalAmount > 0 && roomNights > 0) {
                    const reservaEnDb = reservasBookingDb.get(reservationNumber);
                    if (reservaEnDb) {
                        const precioPorNoche = originalAmount / roomNights;
                        preciosPorNoche.push({
                            cabaña: reservaEnDb.alojamiento,
                            temporada: getTemporada(reservaEnDb.fechaLlegada),
                            precioPorNocheUSD: precioPorNoche
                        });
                    }
                }
            }
            console.log(`[Análisis Histórico] Se encontraron ${preciosPorNoche.length} noches válidas para analizar.`);

            // 4. Agrupar y encontrar el valor MÁXIMO
            const analisis = {};
            preciosPorNoche.forEach(item => {
                const key = `${item.cabaña}|${item.temporada}`;
                if (!analisis[key]) {
                    analisis[key] = {
                        cabaña: item.cabaña,
                        temporada: item.temporada,
                        precioMaximoUSD: 0, // Iniciar en 0
                        conteoNoches: 0
                    };
                }
                // Si el precio actual es mayor que el máximo guardado, se actualiza
                if (item.precioPorNocheUSD > analisis[key].precioMaximoUSD) {
                    analisis[key].precioMaximoUSD = item.precioPorNocheUSD;
                }
                analisis[key].conteoNoches++;
            });

            const resultadoFinal = Object.values(analisis).map(item => ({
                cabaña: item.cabaña,
                temporada: item.temporada,
                precioMaximoUSD: Math.round(item.precioMaximoUSD), // Devolvemos el precio máximo
                nochesAnalizadas: item.conteoNoches
            })).sort((a, b) => a.cabaña.localeCompare(b.cabaña) || a.temporada.localeCompare(b.temporada));
            
            console.log('[Análisis Histórico] Proceso completado.');
            res.status(200).json(resultadoFinal);

        } catch (error) {
            console.error("Error durante el análisis de tarifas históricas:", error);
            res.status(500).json({ error: 'Error interno del servidor durante el análisis.' });
        }
    });

    return router;
};