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

    // --- INICIO DE LA NUEVA LÓGICA DE AGRUPACIÓN ---
    const reservasAgrupadas = new Map();

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const reservaId = data.reservaIdOriginal;

        if (!reservasAgrupadas.has(reservaId)) {
            reservasAgrupadas.set(reservaId, {
                // Datos del grupo
                reservaIdOriginal: reservaId,
                clienteNombre: data.clienteNombre,
                telefono: data.telefono || 'N/A', // Se asume que es el mismo para el grupo
                fechaLlegada: data.fechaLlegada ? data.fechaLlegada.toDate() : null,
                fechaSalida: data.fechaSalida ? data.fechaSalida.toDate() : null,
                estadoGestion: data.estadoGestion, // Se toma el de la primera reserva que encuentre
                documentos: data.documentos || {},
                // Contenedor para las reservas individuales
                reservasIndividuales: [],
                // Acumuladores para los totales del grupo
                valorCLP: 0,
                abono: 0
            });
        }

        const grupo = reservasAgrupadas.get(reservaId);
        
        // Se agrega la reserva individual al grupo
        grupo.reservasIndividuales.push({
            id: doc.id,
            alojamiento: data.alojamiento,
            valorCLP: data.valorCLP || 0,
            abono: data.abono || 0,
        });

        // Se actualizan los totales del grupo sumando los de cada reserva individual
        grupo.valorCLP += data.valorCLP || 0;
        // El abono se suma individualmente por si estuviera registrado de forma separada
        grupo.abono += data.abono || 0;
    });
    // --- FIN DE LA NUEVA LÓGICA DE AGRUPACIÓN ---

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