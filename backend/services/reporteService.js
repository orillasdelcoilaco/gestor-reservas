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
        db.collection('reservas').where('estado', '==', 'Confirmada').get()
    ]);

    const cabanas = cabanasSnapshot.docs.map(doc => doc.data());
    const reporte = [];

    for (const cabana of cabanas) {
        const llegadaHoy = reservasSnapshot.docs
            .map(d => d.data())
            .find(r => r.alojamiento === cabana.nombre && r.fechaLlegada.toDate().getTime() === fecha.getTime());
        
        const salidaHoy = reservasSnapshot.docs
            .map(d => d.data())
            .find(r => r.alojamiento === cabana.nombre && r.fechaSalida.toDate().getTime() === fecha.getTime());

        const enEstadia = reservasSnapshot.docs
            .map(d => d.data())
            .find(r => r.alojamiento === cabana.nombre && r.fechaLlegada.toDate() < fecha && r.fechaSalida.toDate() > fecha);

        const cabanaInfo = { cabana: cabana.nombre };

        if (salidaHoy) {
            cabanaInfo.salida = {
                cliente: salidaHoy.clienteNombre,
                reservaId: salidaHoy.reservaIdOriginal,
                fechas: `${salidaHoy.fechaLlegada.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' })} al ${salidaHoy.fechaSalida.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' })}`
            };
        }

        if (llegadaHoy) {
            cabanaInfo.llegada = {
                cliente: llegadaHoy.clienteNombre,
                reservaId: llegadaHoy.reservaIdOriginal,
                fechas: `${llegadaHoy.fechaLlegada.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' })} al ${llegadaHoy.fechaSalida.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' })}`,
                canal: llegadaHoy.canal
            };
        } else if (enEstadia) {
            cabanaInfo.estadia = {
                cliente: enEstadia.clienteNombre,
                reservaId: enEstadia.reservaIdOriginal,
                fechas: `${enEstadia.fechaLlegada.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' })} al ${enEstadia.fechaSalida.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' })}`
            };
        }

        if (!llegadaHoy && !salidaHoy && !enEstadia) {
            const proximaReservaSnapshot = await db.collection('reservas')
                .where('alojamiento', '==', cabana.nombre)
                .where('estado', '==', 'Confirmada')
                .where('fechaLlegada', '>=', fechaTimestamp)
                .orderBy('fechaLlegada', 'asc')
                .limit(1)
                .get();
            
            if (!proximaReservaSnapshot.empty) {
                const proxima = proximaReservaSnapshot.docs[0].data();
                const diasFaltantes = Math.ceil((proxima.fechaLlegada.toDate() - fecha) / (1000 * 60 * 60 * 24));
                cabanaInfo.proxima = {
                    fecha: proxima.fechaLlegada.toDate().toLocaleDateString('es-CL', { timeZone: 'UTC' }),
                    diasFaltantes: diasFaltantes,
                    cliente: proxima.clienteNombre
                };
            } else {
                cabanaInfo.estado = 'Libre sin próximas reservas';
            }
        }
        
        reporte.push(cabanaInfo);
    }

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
        const tarifa = tarifasSnapshot.docs
            .map(doc => doc.data())
            .filter(t => t.nombreCabaña === cabana.nombre)
            .sort((a, b) => b.fechaInicio.toDate() - a.fechaInicio.toDate())[0];

        if (!tarifa) {
            return null;
        }

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
    }).filter(Boolean); // <-- Se añade .filter(Boolean) para eliminar los nulos.

    return reporte;
}


module.exports = {
    getActividadDiaria,
    getDisponibilidadPeriodo
};