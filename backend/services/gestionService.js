const admin = require('firebase-admin');

function getTodayUTC() {
    const today = new Date();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

async function getReservasPendientes(db) {
    const clientsSnapshot = await db.collection('clientes').get();
    const clientsMap = new Map();
    clientsSnapshot.forEach(doc => {
        clientsMap.set(doc.id, doc.data());
    });

    const snapshot = await db.collection('reservas')
        .where('estado', '==', 'Confirmada')
        .where('estadoGestion', '!=', 'Facturado')
        .get();

    if (snapshot.empty) {
        return [];
    }

    const reservasAgrupadas = new Map();

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const reservaId = data.reservaIdOriginal;

        if (!reservasAgrupadas.has(reservaId)) {
            const clienteActual = clientsMap.get(data.clienteId);
            const telefonoActualizado = clienteActual ? clienteActual.phone : data.telefono;

            reservasAgrupadas.set(reservaId, {
                reservaIdOriginal: reservaId,
                // --- INICIO DE LA MODIFICACIÓN ---
                clienteId: data.clienteId, // Se añade el ID del cliente al grupo
                // --- FIN DE LA MODIFICACIÓN ---
                clienteNombre: data.clienteNombre,
                telefono: telefonoActualizado || 'N/A',
                fechaLlegada: data.fechaLlegada ? data.fechaLlegada.toDate() : null,
                fechaSalida: data.fechaSalida ? data.fechaSalida.toDate() : null,
                estadoGestion: data.estadoGestion,
                documentos: data.documentos || {},
                reservasIndividuales: [],
                valorCLP: 0,
                abono: 0,
                valorPotencialTotal: 0,
                potencialCalculado: false 
            });
        }

        const grupo = reservasAgrupadas.get(reservaId);
        
        grupo.reservasIndividuales.push({
            id: doc.id,
            alojamiento: data.alojamiento,
            valorCLP: data.valorCLP || 0,
            abono: data.abono || 0,
        });

        grupo.valorCLP += data.valorCLP || 0;
        grupo.abono += data.abono || 0;
        
        if (data.valorPotencialCLP && data.valorPotencialCLP > 0) {
            grupo.valorPotencialTotal += data.valorPotencialCLP;
            grupo.potencialCalculado = true;
        }
    });

    const reservas = Array.from(reservasAgrupadas.values());
    const today = getTodayUTC();

    const priorityOrder = {
        'Pendiente Pago': 1,
        'Pendiente Boleta': 2,
        'Pendiente Cobro': 3,
        'Pendiente Bienvenida': 4
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