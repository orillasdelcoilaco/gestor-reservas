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

    const allReservas = [];
    reservasSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.estado === 'Confirmada' && 
            getUTCDate(data.fechaSalida.toDate()) > startDate && 
            getUTCDate(data.fechaLlegada.toDate()) <= endDate) {
            allReservas.push({ id: doc.id, ...data });
        }
    });

    let ingresoTotalReal = 0;
    let ingresoPotencialTotalBase = 0;
    let totalDescuentosReales = 0;
    let totalNochesDisponiblesPeriodo = 0;

    const analisisPorCabaña = {};
    todasLasCabañas.forEach(nombre => {
        analisisPorCabaña[nombre] = {
            nombre: nombre,
            nochesOcupadas: 0,
            nochesDisponibles: 0,
            ingresoRealTotal: 0,
            descuentoTotal: 0,
            canales: {}
        };
    });
    
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDate = getUTCDate(d);
        for (const cabañaNombre of todasLasCabañas) {
            const tarifaDelDia = allTarifas.find(t => 
                t.nombreCabaña === cabañaNombre && 
                getUTCDate(t.fechaInicio.toDate()) <= currentDate && 
                getUTCDate(t.fechaTermino.toDate()) >= currentDate
            );

            if (tarifaDelDia) {
                analisisPorCabaña[cabañaNombre].nochesDisponibles++;
                totalNochesDisponiblesPeriodo++;

                if (tarifaDelDia.tarifasPorCanal && tarifaDelDia.tarifasPorCanal['SODC']) {
                    ingresoPotencialTotalBase += tarifaDelDia.tarifasPorCanal['SODC'].valor;
                }
                
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
    }
    
    const cabañasActivasEnPeriodo = Object.values(analisisPorCabaña).filter(c => c.nochesDisponibles > 0);
    let warningMessage = null;
    const cabañasExcluidas = todasLasCabañas.filter(nombre => !cabañasActivasEnPeriodo.some(c => c.nombre === nombre));
    if (cabañasExcluidas.length > 0) {
        warningMessage = `Advertencia: Las siguientes cabañas no se consideraron en el cálculo por no tener tarifas definidas en el período seleccionado: ${cabañasExcluidas.join(', ')}.`;
        console.log(`[KPI Service] ${warningMessage}`);
    }

    const reservasPorCanalGeneral = {};
    
    allReservas.forEach(reserva => {
        if (!analisisPorCabaña[reserva.alojamiento]) return;
        
        const nochesEnRango = Math.ceil((Math.min(getUTCDate(reserva.fechaSalida.toDate()), new Date(endDate.getTime() + 86400000)) - Math.max(startDate, getUTCDate(reserva.fechaLlegada.toDate()))) / (1000 * 60 * 60 * 24));
        if(nochesEnRango <= 0) return;

        const valorNocheReal = (reserva.valorCLP || 0) / reserva.totalNoches;
        const ingresoRealReserva = valorNocheReal * nochesEnRango;
        ingresoTotalReal += ingresoRealReserva;
        analisisPorCabaña[reserva.alojamiento].ingresoRealTotal += ingresoRealReserva;
        
        const canal = reserva.canal;
        if (!reservasPorCanalGeneral[canal]) {
            reservasPorCanalGeneral[canal] = { count: 0, ingreso: 0 };
        }
        reservasPorCanalGeneral[canal].count++;
        reservasPorCanalGeneral[canal].ingreso += ingresoRealReserva;

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
    
    const rankingCabañas = cabañasActivasEnPeriodo.map(c => ({
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