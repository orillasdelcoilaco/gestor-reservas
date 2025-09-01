// backend/services/gestionService.js

const admin = require('firebase-admin');

// Función auxiliar para obtener la fecha de hoy en UTC para comparaciones correctas
function getTodayUTC() {
    const today = new Date();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

async function getReservasPendientes(db) {
    const snapshot = await db.collection('reservas')
        .where('estado', '==', 'Confirmada')
        .where('estadoGestion', '!=', 'Facturado')
        .get();

    if (snapshot.empty) {
        return [];
    }

    // --- INICIO DE LA LÓGICA DE AGRUPACIÓN ---
    const reservasAgrupadas = new Map();

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const reservaId = data.reservaIdOriginal;

        if (!reservasAgrupadas.has(reservaId)) {
            reservasAgrupadas.set(reservaId, {
                // Datos del grupo
                reservaIdOriginal: reservaId,
                clienteNombre: data.clienteNombre,
                telefono: data.telefono, // Se asume que es el mismo para el grupo
                fechaLlegada: data.fechaLlegada.toDate(),
                fechaSalida: data.fechaSalida.toDate(),
                estadoGestion: data.estadoGestion, // Se toma el de la primera reserva
                documentos: data.documentos || {},
                // Contenedor para las reservas individuales
                reservasIndividuales: [],
                // Acumuladores
                valorCLP: 0,
                abono: 0,
                valorPotencialCLP: 0,
                descuentoAplicado: 0
            });
        }

        const grupo = reservasAgrupadas.get(reservaId);
        
        // Se agrega la reserva individual al grupo
        grupo.reservasIndividuales.push({
            id: doc.id,
            alojamiento: data.alojamiento,
            valorCLP: data.valorCLP || 0,
            valorPotencialCLP: data.valorPotencialCLP || data.valorCLP, // Si no existe, se asume el mismo
            descuentoAplicado: data.descuentoAplicado || 0
        });

        // Se actualizan los totales del grupo
        grupo.valorCLP += data.valorCLP || 0;
        grupo.abono += data.abono || 0;
        grupo.valorPotencialCLP += data.valorPotencialCLP || data.valorCLP;
        grupo.descuentoAplicado += data.descuentoAplicado || 0;
    });
    // --- FIN DE LA LÓGICA DE AGRUPACIÓN ---

    const reservas = Array.from(reservasAgrupadas.values());
    const today = getTodayUTC();

    // Lógica de priorización (ahora se aplica a los grupos)
    const priorityOrder = {
        'Pendiente Pago': 1,
        'Pendiente Boleta': 2,
        'Pendiente Cobro': 3,
        'Pendiente Bienvenida': 4
    };
    
    reservas.sort((a, b) => {
        const aLlegaHoy = a.fechaLlegada.getTime() === today.getTime();
        const bLlegaHoy = b.fechaLlegada.getTime() === today.getTime();

        if (aLlegaHoy && !bLlegaHoy) return -1;
        if (!aLlegaHoy && bLlegaHoy) return 1;

        if (aLlegaHoy && bLlegaHoy) {
            const priorityA = priorityOrder[a.estadoGestion] || 99;
            const priorityB = priorityOrder[b.estadoGestion] || 99;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
        }
        
        return a.fechaLlegada - b.fechaLlegada;
    });

    return reservas;
}

module.exports = {
    getReservasPendientes,
};