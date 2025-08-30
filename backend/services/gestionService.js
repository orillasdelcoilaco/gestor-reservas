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

    const reservas = snapshot.docs.map(doc => {
        const data = doc.data();
        // --- CORRECCIÓN APLICADA AQUÍ ---
        // Se asegura que las fechas existan y se añaden los nuevos campos para la interfaz.
        return {
            id: doc.id,
            ...data,
            fechaLlegada: data.fechaLlegada ? data.fechaLlegada.toDate() : null,
            fechaSalida: data.fechaSalida ? data.fechaSalida.toDate() : null,
            fechaReserva: data.fechaReserva ? data.fechaReserva.toDate() : null,
            // --- NUEVOS CAMPOS AÑADIDOS ---
            valorCLP: data.valorCLP || 0,
            abono: data.abono || 0,
            documentos: data.documentos || {} // Devuelve un objeto vacío si no hay documentos
        };
    }).filter(reserva => reserva.fechaLlegada); // Filtramos cualquier reserva que no tenga fecha de llegada

    const today = getTodayUTC();

    // Lógica de priorización
    const priorityOrder = {
        'Pendiente Pago': 1,
        'Pendiente Boleta': 2,
        'Pendiente Cobro': 3,
        'Pendiente Bienvenida': 4
    };
    
    reservas.sort((a, b) => {
        const aLlegaHoy = a.fechaLlegada.getTime() === today.getTime();
        const bLlegaHoy = b.fechaLlegada.getTime() === today.getTime();

        // Prioridad 1: Reservas que llegan hoy
        if (aLlegaHoy && !bLlegaHoy) return -1;
        if (!aLlegaHoy && bLlegaHoy) return 1;

        // Si ambas (o ninguna) llegan hoy, ordenar por estado de gestión
        if (aLlegaHoy && bLlegaHoy) {
            const priorityA = priorityOrder[a.estadoGestion] || 99;
            const priorityB = priorityOrder[b.estadoGestion] || 99;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
        }
        
        // Prioridad 2: Reservas futuras, las más próximas primero
        return a.fechaLlegada - b.fechaLlegada;
    });

    return reservas;
}


module.exports = {
    getReservasPendientes,
};