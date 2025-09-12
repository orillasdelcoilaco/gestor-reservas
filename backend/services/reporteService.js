const admin = require('firebase-admin');

/**
 * Obtiene un resumen de la actividad diaria (llegadas, estadías, libres).
 * @param {admin.firestore.Firestore} db - Instancia de Firestore.
 * @param {string} fechaStr - La fecha en formato YYYY-MM-DD.
 * @returns {Promise<Array>} Un array con el estado de cada cabaña.
 */
async function getActividadDiaria(db, fechaStr) {
    const fecha = new Date(fechaStr + 'T00:00:00Z');
    const fechaTimestamp = admin.firestore.Timestamp.fromDate(fecha);

    const [cabanasSnapshot, reservasSnapshot] = await Promise.all([
        db.collection('cabanas').orderBy('nombre', 'asc').get(),
        db.collection('reservas')
            .where('fechaLlegada', '<=', fechaTimestamp)
            .where('estado', '==', 'Confirmada')
            .get()
    ]);

    const cabanas = cabanasSnapshot.docs.map(doc => doc.data());
    const reservasActivas = new Map();

    reservasSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.fechaSalida.toDate() > fecha) {
            reservasActivas.set(data.alojamiento, data);
        }
    });

    const reporte = cabanas.map(cabana => {
        const reserva = reservasActivas.get(cabana.nombre);
        if (reserva) {
            const llegada = reserva.fechaLlegada.toDate();
            const esLlegadaHoy = llegada.getUTCFullYear() === fecha.getUTCFullYear() &&
                                llegada.getUTCMonth() === fecha.getUTCMonth() &&
                                llegada.getUTCDate() === fecha.getUTCDate();
            
            return {
                cabana: cabana.nombre,
                estado: esLlegadaHoy ? 'Llega hoy' : 'En estadía',
                cliente: reserva.clienteNombre,
                reservaId: reserva.reservaIdOriginal,
                fechas: `${llegada.toLocaleDateString('es-CL', { timeZone: 'UTC' })} al ${reserva.fechaSalida.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' })}`,
                canal: reserva.canal
            };
        } else {
            return {
                cabana: cabana.nombre,
                estado: 'Sin reserva hoy'
            };
        }
    });

    return reporte;
}

/**
 * Obtiene un resumen de disponibilidad para un período de fechas.
 * @param {admin.firestore.Firestore} db - Instancia de Firestore.
 * @param {string} fechaInicioStr - Fecha de inicio en formato YYYY-MM-DD.
 * @param {string} fechaFinStr - Fecha de fin en formato YYYY-MM-DD.
 * @returns {Promise<Array>} Un array con la disponibilidad de cada cabaña.
 */
async function getDisponibilidadPeriodo(db, fechaInicioStr, fechaFinStr) {
    const fechaInicio = new Date(fechaInicioStr + 'T00:00:00Z');
    const fechaFin = new Date(fechaFinStr + 'T23:59:59Z');

    const [cabanasSnapshot, tarifasSnapshot, reservasSnapshot] = await Promise.all([
        db.collection('cabanas').orderBy('nombre', 'asc').get(),
        db.collection('tarifas').where('fechaInicio', '<=', admin.firestore.Timestamp.fromDate(fechaInicio)).get(),
        db.collection('reservas')
            .where('fechaSalida', '>=', admin.firestore.Timestamp.fromDate(fechaInicio))
            .where('estado', '==', 'Confirmada')
            .get()
    ]);

    const cabanas = cabanasSnapshot.docs.map(doc => doc.data());

    const reporte = cabanas.map(cabana => {
        // Obtener la tarifa más relevante para la cabaña
        const tarifa = tarifasSnapshot.docs
            .map(doc => doc.data())
            .filter(t => t.nombreCabaña === cabana.nombre)
            .sort((a, b) => b.fechaInicio.toDate() - a.fechaInicio())[0];

        // Filtrar y ordenar las reservas para esta cabaña
        const reservasDeCabana = reservasSnapshot.docs
            .map(doc => doc.data())
            .filter(r => r.alojamiento === cabana.nombre && r.fechaLlegada.toDate() < fechaFin)
            .sort((a, b) => a.fechaLlegada.toDate() - b.fechaLlegada.toDate());

        const periodosDisponibles = [];
        let cursorFecha = new Date(fechaInicio);

        reservasDeCabana.forEach(reserva => {
            const llegada = reserva.fechaLlegada.toDate();
            if (cursorFecha < llegada) {
                periodosDisponibles.push({ inicio: new Date(cursorFecha), fin: new Date(llegada) });
            }
            cursorFecha = new Date(Math.max(cursorFecha, reserva.fechaSalida.toDate()));
        });

        if (cursorFecha < fechaFin) {
            periodosDisponibles.push({ inicio: new Date(cursorFecha), fin: null });
        }
        
        return {
            cabana: cabana.nombre,
            link: cabana.linkFotos || `https://orillasdelcoilaco.cl/wp/accommodation/${cabana.nombre.toLowerCase().replace(' ', '-')}/`,
            valor: tarifa?.tarifasPorCanal?.SODC?.valor || 0,
            capacidad: cabana.capacidad,
            periodos: periodosDisponibles.map(p => ({
                inicio: p.inicio.toISOString().split('T')[0],
                fin: p.fin ? p.fin.toISOString().split('T')[0] : null
            }))
        };
    });

    return reporte;
}


module.exports = {
    getActividadDiaria,
    getDisponibilidadPeriodo
};