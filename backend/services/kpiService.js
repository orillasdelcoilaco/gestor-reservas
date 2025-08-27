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
    
    const allReservasPromises = reservasSnapshot.docs.map(async doc => {
        const data = doc.data();
        const fechaSalidaReserva = getUTCDate(data.fechaSalida.toDate());
        if (data.estado !== 'Cancelada' && fechaSalidaReserva > startDate) {
            return { id: doc.id, ...data };
        }
        return null;
    });
    
    const allReservas = (await Promise.all(allReservasPromises)).filter(Boolean);
    const tarifasSnapshot = await db.collection('tarifas').get();
    const allTarifas = tarifasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const cabañasDisponibles = ['Cabaña 1', 'Cabaña 2', 'Cabaña 3', 'Cabaña 9', 'Cabaña 10'];
    const daysInRange = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
    const totalNochesDisponibles = cabañasDisponibles.length * daysInRange;

    let ingresoTotalReal = 0;
    let ingresoPotencialTotalGeneral = 0;
    let totalNochesOcupadas = 0;
    const analisisTemporal = {};
    const reservasPorCanal = {};

    // --- LÓGICA DE CONTEO DE RESERVAS (CORREGIDA Y SIMPLIFICADA) ---
    const reservasUnicasContadas = new Set(); // Para no contar la misma reserva dos veces
    
    allReservas.forEach(reserva => {
        const uniqueId = `${reserva.reservaIdOriginal}|${reserva.canal}`;
        const cabañaNombre = cabañasDisponibles.find(c => c.toLowerCase() === reserva.alojamiento.toLowerCase());
        if (!cabañaNombre) return; // Ignorar si el nombre de la cabaña no es canónico
        
        // Inicializar si es la primera vez que vemos la cabaña
        if (!analisisTemporal[cabañaNombre]) {
            analisisTemporal[cabañaNombre] = { nombre: cabañaNombre, totalReservas: 0, nochesOcupadas: 0, ingresoRealTotal: 0 };
        }
        
        // Contar la reserva solo una vez por cabaña
        const uniqueKeyForCabin = `${uniqueId}|${cabañaNombre}`;
        if (!reservasUnicasContadas.has(uniqueKeyForCabin)) {
            analisisTemporal[cabañaNombre].totalReservas++;
            reservasUnicasContadas.add(uniqueKeyForCabin);

            // Contar para el KPI general de canales (solo una vez por ID de reserva)
            if(!reservasUnicasContadas.has(uniqueId)){
                 if (!reservasPorCanal[reserva.canal]) reservasPorCanal[reserva.canal] = 0;
                 reservasPorCanal[reserva.canal]++;
                 reservasUnicasContadas.add(uniqueId);
            }
        }
    });

    // --- CÁLCULOS FINANCIEROS Y DE OCUPACIÓN ---
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDate = getUTCDate(d);

        for (const cabaña of cabañasDisponibles) {
            const reservaDelDia = allReservas.find(r => 
                r.alojamiento.toLowerCase() === cabaña.toLowerCase() &&
                getUTCDate(r.fechaLlegada.toDate()) <= currentDate &&
                getUTCDate(r.fechaSalida.toDate()) > currentDate
            );

            if (reservaDelDia) {
                totalNochesOcupadas++;
                const valorNocheReal = reservaDelDia.valorCLP / reservaDelDia.totalNoches;
                ingresoTotalReal += valorNocheReal;

                if (!analisisTemporal[cabaña]) {
                    analisisTemporal[cabaña] = { nombre: cabaña, totalReservas: 0, nochesOcupadas: 0, ingresoRealTotal: 0 };
                }
                analisisTemporal[cabaña].nochesOcupadas++;
                analisisTemporal[cabaña].ingresoRealTotal += valorNocheReal;

                const tarifaDelDia = allTarifas.find(t =>
                    t.nombreCabaña.toLowerCase() === cabaña.toLowerCase() &&
                    getUTCDate(t.fechaInicio.toDate()) <= currentDate &&
                    getUTCDate(t.fechaTermino.toDate()) >= currentDate
                );
                
                if (tarifaDelDia && tarifaDelDia.tarifasPorCanal[reservaDelDia.canal]) {
                    if (!analisisTemporal[cabaña].ingresoPotencialTotal) analisisTemporal[cabaña].ingresoPotencialTotal = 0;
                    if (!analisisTemporal[cabaña].canales) analisisTemporal[cabaña].canales = {};
                    const canal = reservaDelDia.canal;
                    if (!analisisTemporal[cabaña].canales[canal]) {
                        analisisTemporal[cabaña].canales[canal] = { ingresoReal: 0, ingresoPotencial: 0 };
                    }
                    
                    let valorNochePotencial = tarifaDelDia.tarifasPorCanal[canal].valor;
                    if (tarifaDelDia.tarifasPorCanal[canal].moneda === 'USD') {
                         const valorDolar = await getValorDolar(db, reservaDelDia.fechaLlegada.toDate());
                         valorNochePotencial = Math.round(valorNochePotencial * valorDolar * 1.19);
                    }
                    
                    analisisTemporal[cabaña].ingresoPotencialTotal += valorNochePotencial;
                    analisisTemporal[cabaña].canales[canal].ingresoReal += valorNocheReal;
                    analisisTemporal[cabaña].canales[canal].ingresoPotencial += valorNochePotencial;
                }
            } 
            
            const tarifaPotencialDelDia = allTarifas.find(t => t.nombreCabaña.toLowerCase() === cabaña.toLowerCase() && getUTCDate(t.fechaInicio.toDate()) <= currentDate && getUTCDate(t.fechaTermino.toDate()) >= currentDate);
            if (tarifaPotencialDelDia && tarifaPotencialDelDia.tarifasPorCanal['SODC']) { 
                ingresoPotencialTotalGeneral += tarifaPotencialDelDia.tarifasPorCanal['SODC'].valor;
            }
        }
    }

    const rankingCabañas = Object.values(analisisTemporal).filter(c => c.nochesOcupadas > 0);

    rankingCabañas.forEach(cabañaData => {
        if (cabañaData.ingresoPotencialTotal) {
            cabañaData.descuentoTotal = cabañaData.ingresoPotencialTotal - cabañaData.ingresoRealTotal;
            for(const canal in cabañaData.canales){
                const canalData = cabañaData.canales[canal];
                canalData.descuento = canalData.ingresoPotencial - canalData.ingresoReal;
            }
        }
    });

    rankingCabañas.sort((a, b) => b.totalReservas - a.totalReservas);

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
            nochesDisponibles: totalNochesDisponibles,
            reservasPorCanal: reservasPorCanal
        },
        rankingCabañas: rankingCabañas
    };
    
    console.log('[KPI Service] Cálculo finalizado (conteo definitivo):', JSON.stringify(results, null, 2));
    
    return results;
}

module.exports = {
    calculateKPIs,
};