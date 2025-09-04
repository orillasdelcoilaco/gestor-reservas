const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');

function getUTCDate(dateStr) {
    // Helper para asegurar que trabajamos con fechas UTC
    const date = new Date(dateStr);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// --- INICIO DE LA MODIFICACIÓN: La función ahora acepta el porcentaje de ocupación ---
async function calculateKPIs(db, fechaInicio, fechaFin, ocupacionProyectada = 100) {
    console.log(`[KPI Service] Iniciando cálculo de KPIs desde ${fechaInicio} hasta ${fechaFin} con una proyección de ocupación del ${ocupacionProyectada}%`);
    
    const startDate = getUTCDate(fechaInicio);
    const endDate = getUTCDate(fechaFin);

    // 1. OBTENER DATOS BASE (CABAÑAS, RESERVAS, TARIFAS)
    const cabanasSnapshot = await db.collection('cabanas').get();
    if (cabanasSnapshot.empty) {
        throw new Error("No se encontraron cabañas en la base de datos. No se pueden calcular los KPIs.");
    }
    const cabañasDisponibles = cabanasSnapshot.docs.map(doc => doc.data().nombre);
    console.log(`[KPI Service] Cabañas activas: ${cabañasDisponibles.join(', ')}`);

    const tarifasSnapshot = await db.collection('tarifas').get();
    const allTarifas = tarifasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const reservasSnapshot = await db.collection('reservas')
        .where('fechaLlegada', '<=', admin.firestore.Timestamp.fromDate(new Date(fechaFin + 'T23:59:59Z')))
        .get();
    
    const allReservas = [];
    for (const doc of reservasSnapshot.docs) {
        const data = doc.data();
        const fechaSalidaReserva = getUTCDate(data.fechaSalida.toDate());
        if (data.estado !== 'Cancelada' && fechaSalidaReserva > startDate && getUTCDate(data.fechaLlegada.toDate()) <= endDate) {
            allReservas.push({ id: doc.id, ...data });
        }
    }

    // 2. INICIALIZAR VARIABLES Y ESTRUCTURAS DE DATOS
    const daysInRange = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
    const totalNochesDisponiblesPeriodo = cabañasDisponibles.length * daysInRange;
    
    let ingresoTotalReal = 0;
    let totalNochesOcupadas = 0;
    let ingresoPotencialProyectado = 0;
    let totalDescuentosReales = 0;

    const analisisPorCabaña = {};
    cabañasDisponibles.forEach(nombre => {
        analisisPorCabaña[nombre] = {
            nombre: nombre,
            nochesOcupadas: 0,
            nochesDisponibles: daysInRange,
            ingresoRealTotal: 0,
            descuentoTotal: 0,
            canales: {} // Para el desglose
        };
    });
    const reservasPorCanalGeneral = {};

    // 3. ANÁLISIS DÍA POR DÍA
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDate = getUTCDate(d);

        for (const cabañaNombre of cabañasDisponibles) {
            // CÁLCULO DEL INGRESO POTENCIAL (PROYECCIÓN)
            const tarifaPotencialDelDia = allTarifas.find(t => 
                t.nombreCabaña.toLowerCase() === cabañaNombre.toLowerCase() && 
                getUTCDate(t.fechaInicio.toDate()) <= currentDate && 
                getUTCDate(t.fechaTermino.toDate()) >= currentDate
            );

            // --- INICIO DE LA MODIFICACIÓN: Validación de tarifas faltantes ---
            if (!tarifaPotencialDelDia || !tarifaPotencialDelDia.tarifasPorCanal['SODC']) {
                throw new Error(`Falta definir la tarifa del canal SODC para la cabaña "${cabañaNombre}" en la fecha ${currentDate.toISOString().split('T')[0]}.`);
            }
            ingresoPotencialProyectado += tarifaPotencialDelDia.tarifasPorCanal['SODC'].valor;
            // --- FIN DE LA MODIFICACIÓN ---

            // ANÁLISIS DE RESERVAS REALES
            const reservaDelDia = allReservas.find(r => 
                r.alojamiento.toLowerCase() === cabañaNombre.toLowerCase() &&
                getUTCDate(r.fechaLlegada.toDate()) <= currentDate &&
                getUTCDate(r.fechaSalida.toDate()) > currentDate
            );

            if (reservaDelDia) {
                const cabañaData = analisisPorCabaña[cabañaNombre];
                cabañaData.nochesOcupadas++;

                // Solo contamos la reserva una vez por cabaña para el conteo de canales
                const reservaCanalKey = `${reservaDelDia.reservaIdOriginal}|${cabañaNombre}`;
                if (!reservasUnicasContadas.has(reservaCanalKey)) {
                    reservasUnicasContadas.add(reservaCanalKey);
                    const canal = reservaDelDia.canal;
                    if (!reservasPorCanalGeneral[canal]) reservasPorCanalGeneral[canal] = 0;
                    reservasPorCanalGeneral[canal]++;
                }
            }
        }
    }

    const reservasUnicasContadas = new Set();
    allReservas.forEach(reserva => {
         const nochesEnRango = Math.round((Math.min(endDate, getUTCDate(reserva.fechaSalida.toDate())) - Math.max(startDate, getUTCDate(reserva.fechaLlegada.toDate()))) / (1000 * 60 * 60 * 24));
         if(nochesEnRango <= 0) return;

         const valorNocheReal = (reserva.valorCLP || 0) / reserva.totalNoches;
         ingresoTotalReal += valorNocheReal * nochesEnRango;
         
         // --- INICIO DE LA MODIFICACIÓN: Cálculo de descuentos reales ---
         if (reserva.valorPotencialCLP && reserva.valorPotencialCLP > 0) {
            const valorNochePotencial = reserva.valorPotencialCLP / reserva.totalNoches;
            const descuentoNoche = valorNochePotencial - valorNocheReal;
            totalDescuentosReales += descuentoNoche * nochesEnRango;
         }
         // --- FIN DE LA MODIFICACIÓN ---
    });


    // 4. CÁLCULO FINAL DE KPIS
    ingresoPotencialProyectado *= (ocupacionProyectada / 100);
    totalNochesOcupadas = Object.values(analisisPorCabaña).reduce((sum, c) => sum + c.nochesOcupadas, 0);

    const tasaOcupacion = totalNochesDisponiblesPeriodo > 0 ? (totalNochesOcupadas / totalNochesDisponiblesPeriodo) * 100 : 0;
    const adr = totalNochesOcupadas > 0 ? ingresoTotalReal / totalNochesOcupadas : 0;
    const revPar = totalNochesDisponiblesPeriodo > 0 ? ingresoTotalReal / totalNochesDisponiblesPeriodo : 0;
    
    // --- INICIO DE LA MODIFICACIÓN: Preparar datos para la tabla del frontend ---
    const rankingCabañas = Object.values(analisisPorCabaña).map(c => ({
        ...c,
        nochesFaltantes: c.nochesDisponibles - c.nochesOcupadas,
        ingresoRealTotal: Math.round(c.ingresoRealTotal),
        descuentoTotal: Math.round(c.descuentoTotal)
    })).sort((a, b) => b.nochesOcupadas - a.nochesOcupadas);
    // --- FIN DE LA MODIFICACIÓN ---

    const results = {
        kpisGenerales: {
            ingresoTotal: Math.round(ingresoTotalReal),
            ingresoPotencialProyectado: Math.round(ingresoPotencialProyectado),
            descuentosTotalesReales: Math.round(totalDescuentosReales),
            tasaOcupacion: parseFloat(tasaOcupacion.toFixed(2)),
            adr: Math.round(adr),
            revPar: Math.round(revPar),
            nochesOcupadas: totalNochesOcupadas,
            nochesDisponibles: totalNochesDisponiblesPeriodo,
            reservasPorCanal: reservasPorCanalGeneral
        },
        rankingCabañas: rankingCabañas
    };
    
    console.log('[KPI Service] Cálculo finalizado (nueva lógica):', JSON.stringify(results, null, 2));
    
    return results;
}

module.exports = {
    calculateKPIs,
};