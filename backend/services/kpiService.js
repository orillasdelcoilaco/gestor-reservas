const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');

/**
 * Normaliza una fecha a medianoche UTC para evitar problemas de zona horaria.
 * @param {Date} date - La fecha a normalizar.
 * @returns {Date} La fecha normalizada.
 */
function getUTCDate(dateStr) {
    const date = new Date(dateStr);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Calcula los KPIs (Key Performance Indicators) para un rango de fechas dado.
 * @param {Firestore} db - La instancia de la base de datos de Firestore.
 * @param {string} fechaInicio - La fecha de inicio del período en formato 'YYYY-MM-DD'.
 * @param {string} fechaFin - La fecha de fin del período en formato 'YYYY-MM-DD'.
 * @returns {Promise<object>} Un objeto con todos los KPIs calculados.
 */
async function calculateKPIs(db, fechaInicio, fechaFin) {
    console.log(`[KPI Service] Iniciando cálculo de KPIs desde ${fechaInicio} hasta ${fechaFin}`);
    
    // Usamos UTC desde el principio para todas las comparaciones
    const startDate = getUTCDate(fechaInicio);
    const endDate = getUTCDate(fechaFin);
    
    // --- PASO 1: OBTENER TODOS LOS DATOS NECESARIOS ---
    
    const reservasSnapshot = await db.collection('reservas')
        .where('fechaLlegada', '<=', admin.firestore.Timestamp.fromDate(new Date(fechaFin + 'T23:59:59Z')))
        .get();
    
    const reservasPromises = reservasSnapshot.docs.map(async doc => {
        const data = doc.data();
        const fechaSalidaReserva = getUTCDate(data.fechaSalida.toDate());
        
        if (data.estado !== 'Cancelada' && fechaSalidaReserva > startDate) {
            if (data.canal === 'Booking' && data.monedaOriginal === 'USD') {
                const valorDolar = await getValorDolar(db, data.fechaLlegada.toDate());
                data.valorCLP = Math.round(data.valorOriginal * valorDolar * 1.19);
            }
            return { id: doc.id, ...data };
        }
        return null;
    });
    
    const allReservas = (await Promise.all(reservasPromises)).filter(Boolean);
    console.log(`[KPI Service] Se encontraron ${allReservas.length} reservas relevantes.`);

    const tarifasSnapshot = await db.collection('tarifas').get();
    const allTarifas = tarifasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`[KPI Service] Se encontraron ${allTarifas.length} registros de tarifas.`);

    // --- PASO 2: CONSTRUIR ESTRUCTURAS DE DATOS PARA CÁLCULO ---

    const cabañasDisponibles = ['Cabaña 1', 'Cabaña 2', 'Cabaña 3', 'Cabaña 9', 'Cabaña 10'];
    const daysInRange = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
    const totalNochesDisponibles = cabañasDisponibles.length * daysInRange;

    let ingresoTotalReal = 0;
    let ingresoTotalPotencial = 0;
    let totalNochesOcupadas = 0;

    // --- PASO 3: ITERAR DÍA POR DÍA Y CABAÑA POR CABAÑA ---

    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDate = getUTCDate(d);

        for (const cabaña of cabañasDisponibles) {
            const reservaDelDia = allReservas.find(r => 
                r.alojamiento === cabaña &&
                getUTCDate(r.fechaLlegada.toDate()) <= currentDate &&
                getUTCDate(r.fechaSalida.toDate()) > currentDate
            );

            const tarifaDelDia = allTarifas.find(t =>
                t.nombreCabaña === cabaña &&
                getUTCDate(t.fechaInicio.toDate()) <= currentDate &&
                getUTCDate(t.fechaTermino.toDate()) >= currentDate
            );

            // --- LOGS DE DIAGNÓSTICO ---
            if(cabaña === "Cabaña 1") { // Log solo para la cabaña que nos interesa
                 console.log(`\n[DIAGNÓSTICO] Fecha: ${currentDate.toISOString().split('T')[0]}, Cabaña: ${cabaña}`);
                 if(reservaDelDia) console.log(` -> Reserva encontrada: ID ${reservaDelDia.reservaIdOriginal}`);
                 if(tarifaDelDia) console.log(` -> Tarifa encontrada: Temporada ${tarifaDelDia.temporada}`);
            }
            // --- FIN LOGS ---

            if (reservaDelDia) {
                totalNochesOcupadas++;
                const valorNocheReal = reservaDelDia.valorCLP / reservaDelDia.totalNoches;
                ingresoTotalReal += valorNocheReal;

                if (tarifaDelDia && tarifaDelDia.tarifasPorCanal[reservaDelDia.canal]) {
                    const tarifaOficialCanal = tarifaDelDia.tarifasPorCanal[reservaDelDia.canal];
                    let valorNochePotencial = tarifaOficialCanal.valor;

                    if (tarifaOficialCanal.moneda === 'USD') {
                         const valorDolar = await getValorDolar(db, reservaDelDia.fechaLlegada.toDate());
                         valorNochePotencial = Math.round(valorNochePotencial * valorDolar * 1.19);
                    }
                    ingresoTotalPotencial += valorNochePotencial;
                } else {
                    ingresoTotalPotencial += valorNocheReal;
                }
            } else {
                 if (tarifaDelDia && tarifaDelDia.tarifasPorCanal['SODC']) {
                    ingresoTotalPotencial += tarifaDelDia.tarifasPorCanal['SODC'].valor;
                 }
            }
        }
    }

    // --- PASO 4: CALCULAR Y CONSOLIDAR LOS RESULTADOS FINALES ---

    const tasaOcupacion = totalNochesDisponibles > 0 ? (totalNochesOcupadas / totalNochesDisponibles) * 100 : 0;
    const adr = totalNochesOcupadas > 0 ? ingresoTotalReal / totalNochesOcupadas : 0;
    const revPar = totalNochesDisponibles > 0 ? ingresoTotalReal / totalNochesDisponibles : 0;
    const totalDescuentos = ingresoTotalPotencial > ingresoTotalReal ? ingresoTotalPotencial - ingresoTotalReal : 0;


    const results = {
        ingresoTotal: Math.round(ingresoTotalReal),
        tasaOcupacion: parseFloat(tasaOcupacion.toFixed(2)),
        adr: Math.round(adr),
        revPar: Math.round(revPar),
        ingresoPotencial: Math.round(ingresoTotalPotencial),
        totalDescuentos: Math.round(totalDescuentos),
        nochesOcupadas: totalNochesOcupadas,
        nochesDisponibles: totalNochesDisponibles
    };
    
    console.log('[KPI Service] Cálculo finalizado con datos reales:', results);
    
    return results;
}

module.exports = {
    calculateKPIs,
};