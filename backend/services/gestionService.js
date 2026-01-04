const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');

function getTodayUTC() {
    const today = new Date();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

function toUTCDate(dateValue) {
    return new Date(Date.UTC(dateValue.getUTCFullYear(), dateValue.getUTCMonth(), dateValue.getUTCDate()));
}

async function getReservasPendientes(db) {
    const todayUTC = getTodayUTC();
    const valorDolarHoy = await getValorDolar(db, todayUTC);

    const [clientsSnapshot, reservasSnapshot, notasSnapshot] = await Promise.all([
        db.collection('clientes').get(),
        db.collection('reservas').where('estado', '==', 'Confirmada').where('estadoGestion', '!=', 'Facturado').get(),
        db.collection('gestion_notas').get()
    ]);

    const clientsMap = new Map();
    clientsSnapshot.forEach(doc => {
        clientsMap.set(doc.id, doc.data());
    });

    const notesCountMap = new Map();
    notasSnapshot.forEach(doc => {
        const nota = doc.data();
        const id = nota.reservaIdOriginal;
        notesCountMap.set(id, (notesCountMap.get(id) || 0) + 1);
    });

    if (reservasSnapshot.empty) {
        return [];
    }

    const reservasAgrupadas = new Map();

    const batch = db.batch();
    let recalculated = 0;

    for (const doc of reservasSnapshot.docs) {
        const data = doc.data();
        const reservaId = data.reservaIdOriginal;

        const llegadaDate = data.fechaLlegada && typeof data.fechaLlegada.toDate === 'function' ? data.fechaLlegada.toDate() : null;
        const salidaDate = data.fechaSalida && typeof data.fechaSalida.toDate === 'function' ? data.fechaSalida.toDate() : null;

        const llegadaUTC = llegadaDate ? toUTCDate(llegadaDate) : null;
        const esBookingUSD = data.canal === 'Booking' && data.monedaOriginal === 'USD';

        if (esBookingUSD && llegadaUTC) {
            let targetDolar = valorDolarHoy;
            // Si el check-in está en el pasado (ayer o antes), usar el dólar de esa fecha.
            // Si es hoy o futuro, usar el dólar de hoy.
            if (llegadaUTC.getTime() < todayUTC.getTime()) {
                try {
                    targetDolar = await getValorDolar(db, llegadaUTC);
                } catch (e) {
                    console.warn(`Error obteniendo dolar para fecha ${llegadaUTC}:`, e);
                    // Fallback to existing or today's if fetch fails, but preferably keep existing if valid
                    targetDolar = data.valorDolarDia || valorDolarHoy;
                }
            }



            // Fallback for missing valorOriginal
            const baseUSD = data.valorOriginal || data.valorFinalUSD || data.valorPotencialUSD || 0;

            // Solo actualizar si el valor del dólar difiere
            if (baseUSD > 0 && data.valorDolarDia !== targetDolar) {
                const factor = data.precioIncluyeIva ? 1.0 : 1.19;
                const nuevoValorCLP = Math.round(baseUSD * targetDolar * factor);
                const nuevoValorPotencialCLP = data.valorPotencialUSD ? Math.round(data.valorPotencialUSD * targetDolar * factor) : (data.valorPotencialCLP || nuevoValorCLP);

                batch.update(db.collection('reservas').doc(doc.id), {
                    valorDolarDia: targetDolar,
                    valorCLP: nuevoValorCLP,
                    valorPotencialCLP: nuevoValorPotencialCLP,
                    valorConIva: nuevoValorCLP
                });
                recalculated++;
                data.valorCLP = nuevoValorCLP;
                data.valorPotencialCLP = nuevoValorPotencialCLP;
                data.valorDolarDia = targetDolar;
            }
        }

        if (!reservasAgrupadas.has(reservaId)) {
            const clienteActual = clientsMap.get(data.clienteId);
            const telefonoActualizado = clienteActual ? clienteActual.phone : data.telefono;

            reservasAgrupadas.set(reservaId, {
                reservaIdOriginal: reservaId,
                clienteId: data.clienteId,
                clienteNombre: data.clienteNombre,
                telefono: telefonoActualizado || 'N/A',
                fechaLlegada: llegadaDate,
                fechaSalida: salidaDate,
                estadoGestion: data.estadoGestion,
                documentos: data.documentos || {},
                reservasIndividuales: [],
                valorCLP: 0,
                abono: 0,
                valorPotencialTotal: 0,
                potencialCalculado: false,
                notasCount: notesCountMap.get(reservaId) || 0,
                // Initialize USD fields
                esBookingUSD: false,
                valorDolarDia: null,
                valorTotalUSD: 0,
                canal: data.canal,
                // New Fields for Management
                estadoReserva: data.estado || 'Confirmada',
                enProcesoCancelacion: data.enProcesoCancelacion || false
            });
        }

        const grupo = reservasAgrupadas.get(reservaId);

        grupo.reservasIndividuales.push({
            id: doc.id,
            alojamiento: data.alojamiento,
            valorCLP: data.valorCLP || 0,
            abono: data.abono || 0,
            valorOriginal: data.valorOriginal, // Passed for individual display
            monedaOriginal: data.monedaOriginal
        });

        grupo.valorCLP += data.valorCLP || 0;
        grupo.abono += data.abono || 0;

        if (data.valorPotencialCLP && data.valorPotencialCLP > 0) {
            grupo.valorPotencialTotal += data.valorPotencialCLP;
            grupo.potencialCalculado = true;
        }

        // Add USD info to group if available
        if (data.canal === 'Booking' && data.monedaOriginal === 'USD') {
            grupo.esBookingUSD = true;
            grupo.valorDolarDia = data.valorDolarDia;
            // Fallback for accumulation
            const baseVal = data.valorOriginal || data.valorFinalUSD || data.valorPotencialUSD || 0;
            let factor = 1.19; // Default for Imports (Net Value)

            if (data.precioIncluyeIva) {
                factor = 1.0; // New Manuals (Explicit Gross)
            } else if (!data.valorOriginal && (data.valorFinalUSD || data.valorPotencialUSD)) {
                factor = 1.0; // Old Manuals (Implicit Gross - fallback case)
            }

            grupo.valorTotalUSD += baseVal * factor;
        }
    }

    if (recalculated > 0) {
        await batch.commit();
    }

    const reservas = Array.from(reservasAgrupadas.values());
    const today = getTodayUTC();

    const priorityOrder = {
        'Pendiente Pago': 1,
        'Pendiente Boleta': 2,
        'Pendiente Salida': 3, // Se ajusta el orden para que aparezca después de Boleta
        'Pendiente Cobro': 4,
        'Pendiente Bienvenida': 5
    };

    reservas.sort((a, b) => {
        const aLlegaHoy = a.fechaLlegada && a.fechaLlegada.getTime() === today.getTime();
        const bLlegaHoy = b.fechaLlegada && b.fechaLlegada.getTime() === today.getTime();

        if (aLlegaHoy && !bLlegaHoy) return -1;
        if (!aLlegaHoy && bLlegaHoy) return 1;

        if (aLlegaHoy && bLlegaHoy) {
            const priorityA = priorityOrder[a.estadoGestion] || 99;
            const priorityB = priorityOrder[b.estadoGestion] || 99;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
        }

        if (a.fechaLlegada && b.fechaLlegada) {
            return a.fechaLlegada - b.fechaLlegada;
        }
        return 0;
    });

    return reservas;
}

module.exports = {
    getReservasPendientes,
};
