const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');

function getUTCDate(dateStr) {
    const date = new Date(dateStr);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function calculateKPIs(db, fechaInicio, fechaFin) {
    console.log(`[KPI Service] Iniciando cálculo de KPIs desde ${fechaInicio} hasta ${fechaFin}`);
    
    const startDate = getUTCDate(fechaInicio);
    const endDate = getUTCDate(fechaFin);
    
    const reservasSnapshot = await db.collection('reservas')
        .where('fechaLlegada', '<=', admin.firestore.Timestamp.fromDate(new Date(fechaFin + 'T23:59:59Z')))
        .get();
    
    const reservasPromises = reservasSnapshot.docs.map(async doc => {
        const data = doc.data();
        const fechaSalidaReserva = getUTCDate(data.fechaSalida.toDate());
        
        if (data.estado !== 'Cancelada' && fechaSalidaReserva > startDate) {
            return { id: doc.id, ...data };
        }
        return null;
    });
    
    const allReservas = (await Promise.all(reservasPromises)).filter(Boolean);
    const tarifasSnapshot = await db.collection('tarifas').get();
    const allTarifas = tarifasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const cabañasDisponibles = ['Cabaña 1', 'Cabaña 2', 'Cabaña 3', 'Cabaña 9', 'Cabaña 10'];
    const daysInRange = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
    const totalNochesDisponibles = cabañasDisponibles.length * daysInRange;

    let ingresoTotalReal = 0;
    let ingresoPotencialTotalGeneral = 0;
    let totalNochesOcupadas = 0;
    const analisisPorCabaña = {};

    cabañasDisponibles.forEach(c => {
        analisisPorCabaña[c] = {
            nochesOcupadas: 0,
            nochesDisponibles: daysInRange, // Cada cabaña está disponible todos los días del rango
            tasaOcupacion: 0,
            ingresoRealTotal: 0,
            ingresoPotencialTotal: 0, // Potencial de noches vendidas
            descuentoTotal: 0,
            canales: {}
        };
    });

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

            if (reservaDelDia) {
                totalNochesOcupadas++;
                analisisPorCabaña[cabaña].nochesOcupadas++;
                
                const valorNocheReal = reservaDelDia.valorCLP / reservaDelDia.totalNoches;
                ingresoTotalReal += valorNocheReal;
                analisisPorCabaña[cabaña].ingresoRealTotal += valorNocheReal;
                
                if (tarifaDelDia && tarifaDelDia.tarifasPorCanal[reservaDelDia.canal]) {
                    const tarifaOficial = tarifaDelDia.tarifasPorCanal[reservaDelDia.canal];
                    let valorNochePotencial = tarifaOficial.valor;

                    if (tarifaOficial.moneda === 'USD') {
                         const valorDolar = await getValorDolar(db, reservaDelDia.fechaLlegada.toDate());
                         valorNochePotencial = Math.round(valorNochePotencial * valorDolar * 1.19);
                    }
                    
                    analisisPorCabaña[cabaña].ingresoPotencialTotal += valorNochePotencial;
                    
                    const canal = reservaDelDia.canal;
                    if (!analisisPorCabaña[cabaña].canales[canal]) {
                        analisisPorCabaña[cabaña].canales[canal] = { ingresoReal: 0, ingresoPotencial: 0, descuento: 0 };
                    }
                    analisisPorCabaña[cabaña].canales[canal].ingresoReal += valorNocheReal;
                    analisisPorCabaña[cabaña].canales[canal].ingresoPotencial += valorNochePotencial;
                }
            } 
            
            if (tarifaDelDia && tarifaDelDia.tarifasPorCanal['SODC']) { 
                ingresoPotencialTotalGeneral += tarifaDelDia.tarifasPorCanal['SODC'].valor;
            }
        }
    }

    for(const cabaña in analisisPorCabaña){
        const cabañaData = analisisPorCabaña[cabaña];
        cabañaData.descuentoTotal = cabañaData.ingresoPotencialTotal - cabañaData.ingresoRealTotal;
        cabañaData.tasaOcupacion = cabañaData.nochesDisponibles > 0 ? parseFloat(((cabañaData.nochesOcupadas / cabañaData.nochesDisponibles) * 100).toFixed(2)) : 0;
        
        for(const canal in cabañaData.canales){
            const canalData = cabañaData.canales[canal];
            canalData.descuento = canalData.ingresoPotencial - canalData.ingresoReal;
        }
    }

    const tasaOcupacion = totalNochesDisponibles > 0 ? (totalNochesOcupadas / totalNochesDisponibles) * 100 : 0;
    const adr = totalNochesOcupadas > 0 ? ingresoTotalReal / totalNochesOcupadas : 0;
    const revPar = totalNochesDisponibles > 0 ? ingresoTotalReal / totalNochesDisponibles : 0;

    const results = {
        kpisGenerales: {
            ingresoTotal: Math.round(ingresoTotalReal),
            ingresoPotencialTotal: Math.round(ingresoPotencialTotalGeneral),
            tasaOcupacion: parseFloat(tasaOcupacion.toFixed(2)),
            adr: Math.round(adr),
            revPar: Math.round(revPar),
            nochesOcupadas: totalNochesOcupadas,
            nochesDisponibles: totalNochesDisponibles
        },
        analisisPorCabaña: analisisPorCabaña
    };
    
    console.log('[KPI Service] Cálculo finalizado (lógica definitiva con ranking):', JSON.stringify(results, null, 2));
    
    return results;
}

module.exports = {
    calculateKPIs,
};