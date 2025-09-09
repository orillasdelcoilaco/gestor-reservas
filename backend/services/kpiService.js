const admin = require('firebase-admin');

function getUTCDate(dateStr) {
    const date = new Date(dateStr);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function calculateKPIs(db, fechaInicio, fechaFin) {
    console.log(`[KPI Service] Iniciando cálculo de KPIs desde ${fechaInicio} hasta ${fechaFin}`);
    
    const startDate = getUTCDate(fechaInicio);
    const endDate = getUTCDate(fechaFin);

    const [cabanasSnapshot, tarifasSnapshot, reservasSnapshot] = await Promise.all([
        db.collection('cabanas').get(),
        db.collection('tarifas').get(),
        db.collection('reservas')
            .where('fechaLlegada', '<=', admin.firestore.Timestamp.fromDate(new Date(fechaFin + 'T23:59:59Z')))
            .get()
    ]);

    if (cabanasSnapshot.empty) {
        throw new Error("No se encontraron cabañas en la base de datos.");
    }
    const todasLasCabañas = cabanasSnapshot.docs.map(doc => doc.data().nombre);
    const allTarifas = tarifasSnapshot.docs.map(doc => doc.data());

    const cabañasActivasEnPeriodo = todasLasCabañas.filter(nombreCabaña => {
        return allTarifas.some(tarifa => {
            const inicioTarifa = getUTCDate(tarifa.fechaInicio.toDate());
            const finTarifa = getUTCDate(tarifa.fechaTermino.toDate());
            return tarifa.nombreCabaña === nombreCabaña &&
                   inicioTarifa <= endDate &&
                   finTarifa >= startDate;
        });
    });

    let warningMessage = null;
    const cabañasExcluidas = todasLasCabañas.filter(c => !cabañasActivasEnPeriodo.includes(c));
    if (cabañasExcluidas.length > 0) {
        warningMessage = `Advertencia: Las siguientes cabañas no se consideraron en el cálculo por no tener tarifas definidas en el período seleccionado: ${cabañasExcluidas.join(', ')}.`;
        console.log(`[KPI Service] ${warningMessage}`);
    }

    const allReservas = [];
    reservasSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.estado !== 'Cancelada' && 
            getUTCDate(data.fechaSalida.toDate()) > startDate && 
            getUTCDate(data.fechaLlegada.toDate()) <= endDate) {
            allReservas.push({ id: doc.id, ...data });
        }
    });

    const daysInRange = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
    const totalNochesDisponiblesPeriodo = cabañasActivasEnPeriodo.length * daysInRange;
    
    let ingresoTotalReal = 0;
    let ingresoPotencialTotalBase = 0;
    let totalDescuentosReales = 0;

    const analisisPorCabaña = {};
    cabañasActivasEnPeriodo.forEach(nombre => {
        analisisPorCabaña[nombre] = {
            nombre: nombre,
            nochesOcupadas: 0,
            nochesDisponibles: daysInRange,
            ingresoRealTotal: 0,
            descuentoTotal: 0,
            canales: {}
        };
    });
    // --- INICIO DE LA MODIFICACIÓN ---
    const reservasPorCanalGeneral = {};
    // --- FIN DE LA MODIFICACIÓN ---
    
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDate = getUTCDate(d);
        for (const cabañaNombre of cabañasActivasEnPeriodo) {
            const tarifaPotencialDelDia = allTarifas.find(t => 
                t.nombreCabaña === cabañaNombre && 
                getUTCDate(t.fechaInicio.toDate()) <= currentDate && 
                getUTCDate(t.fechaTermino.toDate()) >= currentDate
            );

            if (!tarifaPotencialDelDia || !tarifaPotencialDelDia.tarifasPorCanal['SODC']) {
                throw new Error(`Falta definir la tarifa del canal SODC para la cabaña "${cabañaNombre}" en la fecha ${currentDate.toISOString().split('T')[0]}.`);
            }
            ingresoPotencialTotalBase += tarifaPotencialDelDia.tarifasPorCanal['SODC'].valor;

            const reservaDelDia = allReservas.find(r => 
                r.alojamiento === cabañaNombre &&
                getUTCDate(r.fechaLlegada.toDate()) <= currentDate &&
                getUTCDate(r.fechaSalida.toDate()) > currentDate
            );

            if (reservaDelDia) {
                analisisPorCabaña[cabañaNombre].nochesOcupadas++;
            }
        }
    }
    
    allReservas.forEach(reserva => {
        if (!analisisPorCabaña[reserva.alojamiento]) return;
        
        const nochesEnRango = Math.ceil((Math.min(getUTCDate(reserva.fechaSalida.toDate()), new Date(endDate.getTime() + 86400000)) - Math.max(startDate, getUTCDate(reserva.fechaLlegada.toDate()))) / (1000 * 60 * 60 * 24));
        if(nochesEnRango <= 0) return;

        const valorNocheReal = (reserva.valorCLP || 0) / reserva.totalNoches;
        const ingresoRealReserva = valorNocheReal * nochesEnRango;
        ingresoTotalReal += ingresoRealReserva;
        analisisPorCabaña[reserva.alojamiento].ingresoRealTotal += ingresoRealReserva;
        
        // --- INICIO DE LA MODIFICACIÓN ---
        const canal = reserva.canal;
        if (!reservasPorCanalGeneral[canal]) {
            reservasPorCanalGeneral[canal] = { count: 0, ingreso: 0 };
        }
        reservasPorCanalGeneral[canal].count++;
        reservasPorCanalGeneral[canal].ingreso += ingresoRealReserva;
        // --- FIN DE LA MODIFICACIÓN ---

        if (reserva.valorPotencialCLP && reserva.valorPotencialCLP > 0) {
           const valorNochePotencial = reserva.valorPotencialCLP / reserva.totalNoches;
           const descuentoNoche = valorNochePotencial - valorNocheReal;
           const descuentoReserva = descuentoNoche * nochesEnRango;
           totalDescuentosReales += descuentoReserva;
           analisisPorCabaña[reserva.alojamiento].descuentoTotal += descuentoReserva;
           
           if(!analisisPorCabaña[reserva.alojamiento].canales[canal]){
               analisisPorCabaña[reserva.alojamiento].canales[canal] = { noches: 0, descuento: 0 };
           }
           analisisPorCabaña[reserva.alojamiento].canales[canal].noches += nochesEnRango;
           analisisPorCabaña[reserva.alojamiento].canales[canal].descuento += descuentoReserva;
        }
    });

    const totalNochesOcupadas = Object.values(analisisPorCabaña).reduce((sum, c) => sum + c.nochesOcupadas, 0);
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
            ingresoPotencialTotalBase: Math.round(ingresoPotencialTotalBase),
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
    
    return { results, warningMessage };
}

module.exports = {
    calculateKPIs,
};