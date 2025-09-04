const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');

function getUTCDate(dateStr) {
    const date = new Date(dateStr);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// --- INICIO DE LA MODIFICACIÓN: Se elimina el parámetro de ocupación ---
async function calculateKPIs(db, fechaInicio, fechaFin) {
    console.log(`[KPI Service] Iniciando cálculo de KPIs desde ${fechaInicio} hasta ${fechaFin}`);
    
    const startDate = getUTCDate(fechaInicio);
    const endDate = getUTCDate(fechaFin);

    const cabanasSnapshot = await db.collection('cabanas').get();
    if (cabanasSnapshot.empty) {
        throw new Error("No se encontraron cabañas en la base de datos.");
    }
    const cabañasDisponibles = cabanasSnapshot.docs.map(doc => doc.data().nombre);
    
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

    const daysInRange = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
    const totalNochesDisponiblesPeriodo = cabañasDisponibles.length * daysInRange;
    
    let ingresoTotalReal = 0;
    let totalNochesOcupadas = 0;
    // --- INICIO DE LA MODIFICACIÓN: Se renombra la variable para claridad ---
    let ingresoPotencialTotalBase = 0;
    // --- FIN DE LA MODIFICACIÓN ---
    let totalDescuentosReales = 0;

    const analisisPorCabaña = {};
    cabañasDisponibles.forEach(nombre => {
        analisisPorCabaña[nombre] = {
            nombre: nombre,
            nochesOcupadas: 0,
            nochesDisponibles: daysInRange,
            ingresoRealTotal: 0,
            descuentoTotal: 0,
            canales: {}
        };
    });
    const reservasPorCanalGeneral = {};
    const reservasUnicasContadas = new Set();

    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDate = getUTCDate(d);
        for (const cabañaNombre of cabañasDisponibles) {
            const tarifaPotencialDelDia = allTarifas.find(t => 
                t.nombreCabaña.toLowerCase() === cabañaNombre.toLowerCase() && 
                getUTCDate(t.fechaInicio.toDate()) <= currentDate && 
                getUTCDate(t.fechaTermino.toDate()) >= currentDate
            );

            if (!tarifaPotencialDelDia || !tarifaPotencialDelDia.tarifasPorCanal['SODC']) {
                throw new Error(`Falta definir la tarifa del canal SODC para la cabaña "${cabañaNombre}" en la fecha ${currentDate.toISOString().split('T')[0]}.`);
            }
            // --- INICIO DE LA MODIFICACIÓN: Se acumula el potencial al 100% ---
            ingresoPotencialTotalBase += tarifaPotencialDelDia.tarifasPorCanal['SODC'].valor;
            // --- FIN DE LA MODIFICACIÓN ---

            const reservaDelDia = allReservas.find(r => 
                r.alojamiento.toLowerCase() === cabañaNombre.toLowerCase() &&
                getUTCDate(r.fechaLlegada.toDate()) <= currentDate &&
                getUTCDate(r.fechaSalida.toDate()) > currentDate
            );

            if (reservaDelDia) {
                analisisPorCabaña[cabañaNombre].nochesOcupadas++;
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
    
    allReservas.forEach(reserva => {
        if (!analisisPorCabaña[reserva.alojamiento]) {
            throw new Error(`Error en la reserva con ID "${reserva.reservaIdOriginal}": La cabaña "${reserva.alojamiento}" no existe en la lista de cabañas activas.`);
        }
        
        const nochesEnRango = Math.ceil((Math.min(getUTCDate(reserva.fechaSalida.toDate()), new Date(endDate.getTime() + 86400000)) - Math.max(startDate, getUTCDate(reserva.fechaLlegada.toDate()))) / (1000 * 60 * 60 * 24));
        if(nochesEnRango <= 0) return;

        const valorNocheReal = (reserva.valorCLP || 0) / reserva.totalNoches;
        const ingresoRealReserva = valorNocheReal * nochesEnRango;
        ingresoTotalReal += ingresoRealReserva;
        analisisPorCabaña[reserva.alojamiento].ingresoRealTotal += ingresoRealReserva;

        if (reserva.valorPotencialCLP && reserva.valorPotencialCLP > 0) {
           const valorNochePotencial = reserva.valorPotencialCLP / reserva.totalNoches;
           const descuentoNoche = valorNochePotencial - valorNocheReal;
           const descuentoReserva = descuentoNoche * nochesEnRango;
           totalDescuentosReales += descuentoReserva;
           analisisPorCabaña[reserva.alojamiento].descuentoTotal += descuentoReserva;
           
           const canal = reserva.canal;
           if(!analisisPorCabaña[reserva.alojamiento].canales[canal]){
               analisisPorCabaña[reserva.alojamiento].canales[canal] = { noches: 0, descuento: 0 };
           }
           analisisPorCabaña[reserva.alojamiento].canales[canal].noches += nochesEnRango;
           analisisPorCabaña[reserva.alojamiento].canales[canal].descuento += descuentoReserva;
        }
    });

    totalNochesOcupadas = Object.values(analisisPorCabaña).reduce((sum, c) => sum + c.nochesOcupadas, 0);
    const tasaOcupacion = totalNochesDisponiblesPeriodo > 0 ? (totalNochesOcupadas / totalNochesDisponiblesPeriodo) * 100 : 0;
    const adr = totalNochesOcupadas > 0 ? ingresoTotalReal / totalNochesOcupadas : 0;
    const revPar = totalNochesDisponiblesPeriodo > 0 ? ingresoTotalReal / totalNochesDisponiblesPeriodo : 0;
    
    const rankingCabañas = Object.values(analisisPorCabaña).map(c => ({
        ...c,
        nochesFaltantes: c.nochesDisponibles - c.nochesOcupadas,
        ingresoRealTotal: Math.round(c.ingresoRealTotal),
        descuentoTotal: Math.round(c.descuentoTotal)
    })).sort((a, b) => b.nochesOcupadas - a.nochesOcupadas);

    const results = {
        kpisGenerales: {
            ingresoTotal: Math.round(ingresoTotalReal),
            // --- INICIO DE LA MODIFICACIÓN: Se devuelve el valor base al 100% ---
            ingresoPotencialTotalBase: Math.round(ingresoPotencialTotalBase),
            // --- FIN DE LA MODIFICACIÓN ---
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
    
    return results;
}

module.exports = {
    calculateKPIs,
};