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
    
    // Objeto temporal para acumular datos
    const analisisTemporal = {};

    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDate = getUTCDate(d);

        for (const cabaña of cabañasDisponibles) {
            const reservaDelDia = allReservas.find(r => 
                r.alojamiento === cabaña &&
                getUTCDate(r.fechaLlegada.toDate()) <= currentDate &&
                getUTCDate(r.fechaSalida.toDate()) > currentDate
            );

            if (reservaDelDia) {
                totalNochesOcupadas++;
                const valorNocheReal = reservaDelDia.valorCLP / reservaDelDia.totalNoches;
                ingresoTotalReal += valorNocheReal;

                // Inicializar la cabaña en el análisis temporal si es la primera vez que la vemos
                if (!analisisTemporal[cabaña]) {
                    analisisTemporal[cabaña] = { 
                        nombre: cabaña,
                        nochesOcupadas: 0, 
                        ingresoRealTotal: 0,
                        // ... más campos se añadirán si se encuentra tarifa
                    };
                }
                analisisTemporal[cabaña].nochesOcupadas++;
                analisisTemporal[cabaña].ingresoRealTotal += valorNocheReal;

                // Buscar tarifa solo si hay reserva
                const tarifaDelDia = allTarifas.find(t =>
                    t.nombreCabaña === cabaña &&
                    getUTCDate(t.fechaInicio.toDate()) <= currentDate &&
                    getUTCDate(t.fechaTermino.toDate()) >= currentDate
                );
                
                if (tarifaDelDia && tarifaDelDia.tarifasPorCanal[reservaDelDia.canal]) {
                    // Si encontramos tarifa, podemos hacer el análisis de descuentos
                    const tarifaOficial = tarifaDelDia.tarifasPorCanal[reservaDelDia.canal];
                    let valorNochePotencial = tarifaOficial.valor;

                    if (tarifaOficial.moneda === 'USD') {
                         const valorDolar = await getValorDolar(db, reservaDelDia.fechaLlegada.toDate());
                         valorNochePotencial = Math.round(valorNochePotencial * valorDolar * 1.19);
                    }
                    
                    // Inicializar campos de análisis de descuento si es la primera vez
                    if (!analisisTemporal[cabaña].ingresoPotencialTotal) analisisTemporal[cabaña].ingresoPotencialTotal = 0;
                    const canal = reservaDelDia.canal;
                    if (!analisisTemporal[cabaña].canales) analisisTemporal[cabaña].canales = {};
                    if (!analisisTemporal[cabaña].canales[canal]) {
                        analisisTemporal[cabaña].canales[canal] = { ingresoReal: 0, ingresoPotencial: 0 };
                    }

                    // Acumular valores para el análisis
                    analisisTemporal[cabaña].ingresoPotencialTotal += valorNochePotencial;
                    analisisTemporal[cabaña].canales[canal].ingresoReal += valorNocheReal;
                    analisisTemporal[cabaña].canales[canal].ingresoPotencial += valorNochePotencial;
                }
            } 
            
            // Cálculo del potencial general (independiente de las reservas)
            const tarifaPotencialDelDia = allTarifas.find(t => t.nombreCabaña === cabaña && getUTCDate(t.fechaInicio.toDate()) <= currentDate && getUTCDate(t.fechaTermino.toDate()) >= currentDate);
            if (tarifaPotencialDelDia && tarifaPotencialDelDia.tarifasPorCanal['SODC']) { 
                ingresoPotencialTotalGeneral += tarifaPotencialDelDia.tarifasPorCanal['SODC'].valor;
            }
        }
    }

    // --- PASO 4: CONSOLIDAR RESULTADOS FINALES Y CREAR EL RANKING ---

    const rankingCabañas = Object.values(analisisTemporal);

    rankingCabañas.forEach(cabañaData => {
        // Solo calcular descuentos si hay un potencial definido (es decir, si se encontró tarifa)
        if (cabañaData.ingresoPotencialTotal) {
            cabañaData.descuentoTotal = cabañaData.ingresoPotencialTotal - cabañaData.ingresoRealTotal;
            for(const canal in cabañaData.canales){
                const canalData = cabañaData.canales[canal];
                canalData.descuento = canalData.ingresoPotencial - canalData.ingresoReal;
            }
        }
    });

    // Ordenar ranking por noches ocupadas (de mayor a menor)
    rankingCabañas.sort((a, b) => b.nochesOcupadas - a.nochesOcupadas);

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
        rankingCabañas: rankingCabañas // <-- EL NUEVO RANKING PLANO
    };
    
    console.log('[KPI Service] Cálculo finalizado (con ranking):', JSON.stringify(results, null, 2));
    
    return results;
}

module.exports = {
    calculateKPIs,
};