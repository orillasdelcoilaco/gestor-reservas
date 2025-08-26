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
    
    // --- PASO 1: OBTENER TODOS LOS DATOS NECESARIOS ---
    
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

    // --- PASO 2: INICIALIZAR VARIABLES PARA LOS CÁLCULOS ---

    const cabañasDisponibles = ['Cabaña 1', 'Cabaña 2', 'Cabaña 3', 'Cabaña 9', 'Cabaña 10'];
    const daysInRange = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
    const totalNochesDisponibles = cabañasDisponibles.length * daysInRange;

    let ingresoTotalReal = 0;
    let ingresoPotencialTotal = 0; // KPI General
    let totalNochesOcupadas = 0;
    const analisisDetallado = {}; // KPI de Descuentos

    // --- PASO 3: ITERAR DÍA POR DÍA PARA CALCULAR LOS KPIS ---

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

            // --- LÓGICA DE CÁLCULO ---

            if (reservaDelDia) {
                // Si la noche está vendida, calculamos el ingreso real y el descuento.
                totalNochesOcupadas++;
                
                const valorNocheReal = reservaDelDia.valorCLP / reservaDelDia.totalNoches;
                ingresoTotalReal += valorNocheReal;

                let valorNochePotencialVenta = valorNocheReal; 

                if (tarifaDelDia && tarifaDelDia.tarifasPorCanal[reservaDelDia.canal]) {
                    const tarifaOficialCanal = tarifaDelDia.tarifasPorCanal[reservaDelDia.canal];
                    valorNochePotencialVenta = tarifaOficialCanal.valor;

                    if (tarifaOficialCanal.moneda === 'USD') {
                         const valorDolar = await getValorDolar(db, reservaDelDia.fechaLlegada.toDate());
                         valorNochePotencialVenta = Math.round(valorNochePotencialVenta * valorDolar * 1.19);
                    }
                }
                
                const descuentoNoche = valorNochePotencialVenta - valorNocheReal;

                if (descuentoNoche > 0) {
                    if (!analisisDetallado[cabaña]) analisisDetallado[cabaña] = {};
                    if (!analisisDetallado[cabaña][reservaDelDia.canal]) {
                        analisisDetallado[cabaña][reservaDelDia.canal] = { descuentoTotal: 0, noches: 0 };
                    }
                    analisisDetallado[cabaña][reservaDelDia.canal].descuentoTotal += descuentoNoche;
                    analisisDetallado[cabaña][reservaDelDia.canal].noches += 1;
                }
            } 
            
            // Calculamos el Ingreso Potencial Total de forma independiente
            if (tarifaDelDia && tarifaDelDia.tarifasPorCanal['SODC']) { 
                ingresoPotencialTotal += tarifaDelDia.tarifasPorCanal['SODC'].valor;
            }
        }
    }

    // --- PASO 4: CONSOLIDAR RESULTADOS FINALES ---

    const tasaOcupacion = totalNochesDisponibles > 0 ? (totalNochesOcupadas / totalNochesDisponibles) * 100 : 0;
    const adr = totalNochesOcupadas > 0 ? ingresoTotalReal / totalNochesOcupadas : 0;
    const revPar = totalNochesDisponibles > 0 ? ingresoTotalReal / totalNochesDisponibles : 0;

    const results = {
        kpisGenerales: {
            ingresoTotal: Math.round(ingresoTotalReal),
            ingresoPotencialTotal: Math.round(ingresoPotencialTotal), // KPI General separado
            tasaOcupacion: parseFloat(tasaOcupacion.toFixed(2)),
            adr: Math.round(adr),
            revPar: Math.round(revPar),
            nochesOcupadas: totalNochesOcupadas,
            nochesDisponibles: totalNochesDisponibles
        },
        analisisDescuentos: analisisDetallado // KPI de Descuentos separado
    };
    
    console.log('[KPI Service] Cálculo finalizado (lógica definitiva):', results);
    
    return results;
}

module.exports = {
    calculateKPIs,
};