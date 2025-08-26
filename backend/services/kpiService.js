const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');

/**
 * Normaliza una fecha a medianoche UTC para evitar problemas de zona horaria.
 * @param {Date} date - La fecha a normalizar.
 * @returns {Date} La fecha normalizada.
 */
function getUTCDate(date) {
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
    
    const startDate = getUTCDate(new Date(fechaInicio));
    const endDate = getUTCDate(new Date(fechaFin));
    
    // --- PASO 1: OBTENER TODOS LOS DATOS NECESARIOS ---
    
    // Obtener todas las reservas que se cruzan con el rango de fechas.
    const reservasSnapshot = await db.collection('reservas')
        .where('fechaLlegada', '<=', admin.firestore.Timestamp.fromDate(endDate))
        .get();
    
    const reservasPromises = reservasSnapshot.docs.map(async doc => {
        const data = doc.data();
        // Solo consideramos las que no están canceladas y que tienen cruce con el período
        if (data.estado !== 'Cancelada' && data.fechaSalida.toDate() > startDate) {
            // Si es Booking y necesitamos convertir, obtenemos el valor del dólar
            if (data.canal === 'Booking' && data.monedaOriginal === 'USD') {
                const valorDolar = await getValorDolar(db, data.fechaLlegada.toDate());
                data.valorCLP = Math.round(data.valorOriginal * valorDolar * 1.19);
            }
            return { id: doc.id, ...data };
        }
        return null;
    });
    
    const allReservas = (await Promise.all(reservasPromises)).filter(Boolean);

    // Obtener todas las tarifas
    const tarifasSnapshot = await db.collection('tarifas').get();
    const allTarifas = tarifasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // --- PASO 2: CONSTRUIR ESTRUCTURAS DE DATOS PARA CÁLCULO ---

    const cabañasDisponibles = ['Cabaña 1', 'Cabaña 2', 'Cabaña 3', 'Cabaña 9', 'Cabaña 10'];
    const daysInRange = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
    const totalNochesDisponibles = cabañasDisponibles.length * daysInRange;

    let ingresoTotalReal = 0;
    let ingresoTotalPotencial = 0;
    let totalNochesOcupadas = 0;

    // --- PASO 3: ITERAR DÍA POR DÍA Y CABAÑA POR CABAÑA ---

    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDate = getUTCDate(new Date(d));

        for (const cabaña of cabañasDisponibles) {
            // Encontrar la reserva para esta cabaña en esta fecha
            const reservaDelDia = allReservas.find(r => 
                r.alojamiento === cabaña &&
                getUTCDate(r.fechaLlegada.toDate()) <= currentDate &&
                getUTCDate(r.fechaSalida.toDate()) > currentDate
            );

            // Encontrar la tarifa oficial para esta cabaña en esta fecha
            const tarifaDelDia = allTarifas.find(t =>
                t.nombreCabaña === cabaña &&
                getUTCDate(t.fechaInicio.toDate()) <= currentDate &&
                getUTCDate(t.fechaTermino.toDate()) >= currentDate
            );

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
                    // Si no hay tarifa oficial, el potencial es igual al real (sin descuento)
                    ingresoTotalPotencial += valorNocheReal;
                }
            } else {
                // Si no hay reserva, solo sumamos al potencial si había una tarifa definida
                 if (tarifaDelDia && tarifaDelDia.tarifasPorCanal['SODC']) { // Usamos SODC como base
                    ingresoTotalPotencial += tarifaDelDia.tarifasPorCanal['SODC'].valor;
                 }
            }
        }
    }

    // --- PASO 4: CALCULAR Y CONSOLIDAR LOS RESULTADOS FINALES ---

    const tasaOcupacion = totalNochesDisponibles > 0 ? (totalNochesOcupadas / totalNochesDisponibles) * 100 : 0;
    const adr = totalNochesOcupadas > 0 ? ingresoTotalReal / totalNochesOcupadas : 0; // Average Daily Rate
    const revPar = totalNochesDisponibles > 0 ? ingresoTotalReal / totalNochesDisponibles : 0; // Revenue Per Available Room
    const totalDescuentos = ingresoTotalPotencial - ingresoTotalReal;

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