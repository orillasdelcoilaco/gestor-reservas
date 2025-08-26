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
                const valorNocheReal = reservaDelDia.valorCLP / reservaDelDia.totalNoches;
                ingresoTotalReal += valorNocheReal;

                // --- LÓGICA CORREGIDA: SOLO ANALIZA SI HAY TARIFA OFICIAL ---
                if (tarifaDelDia && tarifaDelDia.tarifasPorCanal[reservaDelDia.canal]) {
                    const tarifaOficial = tarifaDelDia.tarifasPorCanal[reservaDelDia.canal];
                    let valorNochePotencial = tarifaOficial.valor;

                    if (tarifaOficial.moneda === 'USD') {
                         const valorDolar = await getValorDolar(db, reservaDelDia.fechaLlegada.toDate());
                         valorNochePotencial = Math.round(valorNochePotencial * valorDolar * 1.19);
                    }

                    // Inicializar si no existe
                    if (!analisisPorCabaña[cabaña]) {
                        analisisPorCabaña[cabaña] = { nochesOcupadas: 0, ingresoRealTotal: 0, ingresoPotencialTotal: 0, canales: {} };
                    }
                    const canal = reservaDelDia.canal;
                    if (!analisisPorCabaña[cabaña].canales[canal]) {
                        analisisPorCabaña[cabaña].canales[canal] = { ingresoReal: 0, ingresoPotencial: 0 };
                    }

                    // Acumular valores
                    analisisPorCabaña[cabaña].nochesOcupadas++;
                    analisisPorCabaña[cabaña].ingresoRealTotal += valorNocheReal;
                    analisisPorCabaña[cabaña].ingresoPotencialTotal += valorNochePotencial;
                    analisisPorCabaña[cabaña].canales[canal].ingresoReal += valorNocheReal;
                    analisisPorCabaña[cabaña].canales[canal].ingresoPotencial += valorNochePotencial;
                }
            } 
            
            if (tarifaDelDia && tarifaDelDia.tarifasPorCanal['SODC']) { 
                ingresoPotencialTotalGeneral += tarifaDelDia.tarifasPorCanal['SODC'].valor;
            }
        }
    }

    // --- PASO 4: CONSOLIDAR RESULTADOS FINALES ---

    // Calcular totales de descuento (solo para las cabañas que tuvieron análisis)
    for(const cabaña in analisisPorCabaña){
        analisisPorCabaña[cabaña].descuentoTotal = analisisPorCabaña[cabaña].ingresoPotencialTotal - analisisPorCabaña[cabaña].ingresoRealTotal;
        for(const canal in analisisPorCabaña[cabaña].canales){
            const canalData = analisisPorCabaña[cabaña].canales[canal];
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
    
    console.log('[KPI Service] Cálculo finalizado (lógica definitiva):', JSON.stringify(results, null, 2));
    
    return results;
}

module.exports = {
    calculateKPIs,
};