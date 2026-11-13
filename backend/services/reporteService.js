const admin = require('firebase-admin');
const { cleanCabanaName, nombreCabanaDesdeId } = require('../utils/helpers');

function reservaDeCabana(reserva, nombreCabana) {
    const canon = nombreCabanaDesdeId(reserva && reserva.propiedadId);
    if (canon && canon.toLowerCase() === String(nombreCabana || '').toLowerCase()) return true;
    const alojamiento = cleanCabanaName(String(reserva && reserva.alojamiento || ''));
    return alojamiento.toLowerCase() === String(nombreCabana || '').toLowerCase();
}

function instante(value) {
    if (!value || typeof value.toDate !== 'function') return null;
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Obtiene un resumen de la actividad diaria (llegadas, estadías, libres).
 * @param {admin.firestore.Firestore} db - Instancia de Firestore.
 * @param {string} fechaStr - La fecha en formato YYYY-MM-DD.
 * @returns {Promise<Array>} Un array con el estado de cada cabaña.
 */
async function getActividadDiaria(db, fechaStr) {
    const fecha = new Date(fechaStr + 'T00:00:00Z');

    const [cabanasSnapshot, reservasSnapshot] = await Promise.all([
        db.collection('cabanas').orderBy('nombre', 'asc').get(),
        db.collection('reservas').where('estado', '==', 'Confirmada').get()
    ]);

    const cabanas = cabanasSnapshot.docs.map(doc => doc.data());
    const reservas = reservasSnapshot.docs
        .map(d => d.data())
        .filter(r => instante(r.fechaLlegada) && instante(r.fechaSalida));
    const reporte = [];

    for (const cabana of cabanas) {
        const deEsta = reservas.filter(r => reservaDeCabana(r, cabana.nombre));
        const llegadaHoy = deEsta.find(r => instante(r.fechaLlegada).getTime() === fecha.getTime());
        const salidaHoy = deEsta.find(r => instante(r.fechaSalida).getTime() === fecha.getTime());
        const enEstadia = deEsta.find(r => instante(r.fechaLlegada) < fecha && instante(r.fechaSalida) > fecha);

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
            const proxima = deEsta
                .filter(r => instante(r.fechaLlegada).getTime() >= fecha.getTime())
                .sort((a, b) => instante(a.fechaLlegada) - instante(b.fechaLlegada))[0];

            if (proxima) {
                const diasFaltantes = Math.ceil((instante(proxima.fechaLlegada) - fecha) / (1000 * 60 * 60 * 24));
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
async function getDisponibilidadPeriodo(db, fechaInicioStr, fechaFinStr, exactas = false) {
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

        const valorDiario = tarifa?.tarifasPorCanal?.SODC?.valor || 0;

        const reservasDeCabana = reservasSnapshot.docs
            .map(doc => doc.data())
            .filter(r => reservaDeCabana(r, cabana.nombre) && instante(r.fechaLlegada) && instante(r.fechaLlegada) < fechaFin)
            .sort((a, b) => a.fechaLlegada.toDate() - b.fechaLlegada.toDate());

        const periodosDisponibles = [];
        let cursorFecha = new Date(fechaInicio);

        // Standard availability calculation
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

        const resultBase = {
            cabana: cabana.nombre,
            link: cabana.linkFotos || `https://orillasdelcoilaco.cl/wp/accommodation/${cabana.nombre.toLowerCase().replace(' ', '-')}/`,
            valor: valorDiario,
            capacidad: cabana.capacidad,
        };

        if (exactas) {
            // Logic for Exact Match
            // We check if any available period fully covers the requested range [fechaInicio, fechaFin]
            // Note: fechaFin in request usually implies checkout date. 
            // The available period.fin is the start of the next reservation (checkout of prev). 
            // If period.fin is null, it's open forever.

            // requested end date (checkout)
            const targetCheckout = new Date(fechaFinStr + 'T00:00:00Z');

            const coversRange = periodosDisponibles.some(p => {
                const pStart = p.inicio;
                const pEnd = p.fin; // null means infinite

                // Start condition: Period start <= Requested start
                if (pStart > fechaInicio) return false;

                // End condition: Period end >= Requested end (or null)
                if (pEnd && pEnd < targetCheckout) return false;

                return true;
            });

            if (coversRange) {
                const noches = Math.ceil((targetCheckout - fechaInicio) / (1000 * 60 * 60 * 24));
                return {
                    ...resultBase,
                    disponibleExacto: true,
                    valorDiario: valorDiario,
                    noches: noches,
                    valorTotal: valorDiario * noches,
                    fechaInicioReal: fechaInicioStr,
                    fechaFinReal: fechaFinStr
                };
            } else {
                return null; // Not available exactly
            }

        } else {
            // Standard Logic return
            return {
                ...resultBase,
                periodos: periodosDisponibles.map(p => ({
                    inicio: p.inicio.toISOString().split('T')[0],
                    fin: p.fin ? p.fin.toISOString().split('T')[0] : null
                }))
            };
        }

    }).filter(Boolean);

    return reporte;
}


module.exports = {
    getActividadDiaria,
    getDisponibilidadPeriodo
};