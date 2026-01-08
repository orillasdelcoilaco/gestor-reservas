// backend/services/consolidationService.js - CÓDIGO ACTUALIZADO Y CORREGIDO

const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');
const { createGoogleContact } = require('./googleContactsService');
const { cleanCabanaName, parseDate, parseCurrency, cleanPhoneNumber } = require('../utils/helpers');

function extractCabanaNameFromAirbnb(anuncio) {
    if (!anuncio || typeof anuncio !== 'string') return '';
    const anuncioLower = anuncio.toLowerCase();

    if (anuncioLower.includes('acogedora cabaña familiar')) return 'Cabaña 3';
    if (anuncioLower.includes('cabaña 9')) return 'Cabaña 9';
    if (anuncioLower.includes('cabaña para 8 personas')) return 'Cabaña 10';
    if (anuncioLower.includes('cabañas 1')) return 'Cabaña 1';
    if (anuncioLower.includes('hermosa cabaña rústica')) return 'Cabaña 2';

    const match = anuncio.match(/Cabaña\s*\d+/i);
    return match ? match[0] : anuncio;
}

async function processChannel(db, channel) {
    const rawCollectionName = `reportes_${channel.toLowerCase()}_raw`;
    const rawDocsSnapshot = await db.collection(rawCollectionName).get();

    if (rawDocsSnapshot.empty) {
        return { reportesEncontrados: 0, clientesNuevos: 0, reservasCreadas: 0, reservasActualizadas: 0, mensaje: `No hay nuevos reportes de ${channel} para procesar.` };
    }

    let clientesNuevos = 0, reservasCreadas = 0, reservasActualizadas = 0;

    const reservationsByOriginalId = new Map();
    const allReservasSnapshot = await db.collection('reservas').get();
    allReservasSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.reservaIdOriginal && data.canal) {
            const key = `${data.canal.toUpperCase()}_${data.reservaIdOriginal}`;
            if (!reservationsByOriginalId.has(key)) {
                reservationsByOriginalId.set(key, []);
            }
            reservationsByOriginalId.get(key).push({ id: doc.id, data: doc.data() });
        }
    });

    const existingClientsByPhone = new Map();
    const allClientsSnapshot = await db.collection('clientes').get();
    allClientsSnapshot.forEach(doc => {
        const clientData = doc.data();
        if (clientData.phone) existingClientsByPhone.set(clientData.phone, doc.id);
    });

    const batch = db.batch();
    const genericPhone = '56999999999';

    for (const doc of rawDocsSnapshot.docs) {
        const rawData = doc.data();
        const isBooking = channel === 'Booking';
        const isSodc = channel === 'SODC';
        const isAirbnb = channel === 'Airbnb';

        let reservaData;

        if (isAirbnb) {
            if (rawData['Tipo'] !== 'Reservación') continue;
            const parseAirbnbDate = (dateStr) => {
                if (!dateStr || typeof dateStr !== 'string' || !/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return null;
                const [month, day, year] = dateStr.split('/');
                const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`;
                return new Date(isoDate);
            };

            reservaData = {
                reservaIdOriginal: rawData['Código de confirmación'],
                alojamientos: [extractCabanaNameFromAirbnb(rawData['Anuncio'])],
                nombreCompleto: rawData['Huésped'] || 'Cliente Airbnb',
                telefono: genericPhone,
                email: null,
                fechaLlegada: parseAirbnbDate(rawData['Fecha de inicio']),
                fechaSalida: parseAirbnbDate(rawData['Fecha de finalización']),
                estado: 'Confirmada',
                fechaReserva: parseAirbnbDate(rawData['Fecha de la reservación']),
                totalNoches: parseInt(rawData['Noches'] || 0),
                valorCLP: parseCurrency(rawData['Ingresos brutos'], 'CLP')
            };
        } else {
            const getBookingStatus = (statusValue) => {
                const status = String(statusValue || '').toLowerCase();
                if (status === 'ok') return 'Confirmada';
                if (status === 'cancelled' || status === 'cancelada' || status === 'cancelled_by_guest') return 'Cancelada';
                return 'Cancelada';
            };

            reservaData = {
                reservaIdOriginal: String((isBooking ? rawData['Número de reserva'] || rawData['Book number'] : rawData['Identidad']) || '').trim(),
                alojamientos: String(isBooking ? rawData['Tipo de unidad'] || rawData['Unit type'] : rawData['Alojamiento'] || '').split(',').map(c => cleanCabanaName(c)),
                nombreCompleto: (isBooking ? rawData['Nombre del cliente (o clientes)'] || rawData['Book name'] : `${rawData['Nombre'] || ''} ${rawData['Apellido'] || ''}`.trim()) || "Cliente sin Nombre",
                telefono: cleanPhoneNumber(rawData['Teléfono'] || rawData['Phone'] || rawData['Número de teléfono']) || genericPhone,
                email: rawData['Email'] || rawData['E-mail'] || null,
                fechaLlegada: parseDate(isBooking ? rawData['Entrada'] || rawData['Check-in'] : rawData['Día de llegada']),
                fechaSalida: parseDate(isBooking ? rawData['Salida'] || rawData['Check-out'] : rawData['Día de salida']),
                estado: isBooking ? getBookingStatus(rawData['Estado'] || rawData['Status']) : rawData['Estado'],
                fechaReserva: parseDate(isBooking ? rawData['Fecha de reserva'] || rawData['Booked on'] : rawData['Fecha']),
            };
        }

        if (!reservaData.fechaLlegada || !reservaData.fechaSalida || !reservaData.reservaIdOriginal || reservaData.alojamientos.length === 0 || reservaData.alojamientos[0] === '') {
            continue;
        }

        const lookupKey = `${channel.toUpperCase()}_${reservaData.reservaIdOriginal}`;
        const existingGroup = reservationsByOriginalId.get(lookupKey);

        if (existingGroup) {
            // MODIFICACIÓN CRÍTICA: No sobrescribir estado interno.
            // Solo actualizamos 'estadoReporte' para fines informativos de discrepancia.
            existingGroup.forEach(res => {
                const reservaRef = db.collection('reservas').doc(res.id);
                // Siempre actualizamos lo que dice el reporte
                batch.update(reservaRef, {
                    estadoReporte: reservaData.estado,
                    fechaUltimoReporte: admin.firestore.FieldValue.serverTimestamp()
                });
            });
            // Ya no contamos como "reserva actualizada" de estado, pero sí de reporte.
            // Podemos dejar el contador o comentarlo si solo nos interesa cambio de estado real.
            // reservasActualizadas++; 
        } else {
            reservasCreadas++;

            let clienteId;
            if (reservaData.telefono !== genericPhone && existingClientsByPhone.has(reservaData.telefono)) {
                clienteId = existingClientsByPhone.get(reservaData.telefono);
            } else {
                clientesNuevos++;
                const newClientRef = db.collection('clientes').doc();
                clienteId = newClientRef.id;
                const contactData = { name: `${reservaData.nombreCompleto} ${channel} ${reservaData.reservaIdOriginal}`, phone: reservaData.telefono, email: reservaData.email };
                createGoogleContact(db, contactData).catch(err => console.error("Error al sincronizar con Google Contacts:", err.message));
                batch.set(newClientRef, {
                    firstname: reservaData.nombreCompleto.split(' ')[0],
                    lastname: reservaData.nombreCompleto.split(' ').slice(1).join(' '),
                    email: reservaData.email,
                    phone: reservaData.telefono,
                    googleContactSynced: false
                });
                if (reservaData.telefono !== genericPhone) {
                    existingClientsByPhone.set(reservaData.telefono, clienteId);
                }
            }

            for (const cabana of reservaData.alojamientos) {
                if (!cabana) continue;

                const idCompuesto = `${channel.toUpperCase()}_${reservaData.reservaIdOriginal}_${cabana.replace(/\s+/g, '')}`;
                const reservaRef = db.collection('reservas').doc(idCompuesto);
                const valorOriginal = parseCurrency(isBooking ? rawData['Precio'] || rawData['Room revenue'] || rawData['Price'] : rawData['Total'], isBooking ? 'USD' : 'CLP');
                const valorDolarDia = isBooking ? await getValorDolar(db, reservaData.fechaLlegada) : null;
                const precioPorCabana = reservaData.alojamientos.length > 0 ? (valorOriginal / reservaData.alojamientos.length) : 0;
                const valorCLPCalculado = isBooking ? Math.round(precioPorCabana * valorDolarDia * 1.19) : precioPorCabana;
                const totalNoches = Math.round((reservaData.fechaSalida - reservaData.fechaLlegada) / (1000 * 60 * 60 * 24));

                const dataToSave = {
                    reservaIdOriginal: reservaData.reservaIdOriginal,
                    clienteId: clienteId,
                    clienteNombre: reservaData.nombreCompleto,
                    canal: channel,
                    estado: reservaData.estado,
                    fechaReserva: reservaData.fechaReserva,
                    fechaLlegada: admin.firestore.Timestamp.fromDate(reservaData.fechaLlegada),
                    fechaSalida: admin.firestore.Timestamp.fromDate(reservaData.fechaSalida),
                    totalNoches: totalNoches > 0 ? totalNoches : 1,
                    invitados: parseInt(isBooking ? rawData['Adultos/Invitados'] || rawData['Persons'] : rawData['Personas'] || 0),
                    alojamiento: cabana,
                    monedaOriginal: isBooking ? 'USD' : 'CLP',
                    valorOriginal: precioPorCabana,
                    valorCLP: isAirbnb ? reservaData.valorCLP : valorCLPCalculado,
                    correo: reservaData.email,
                    telefono: reservaData.telefono,
                    pais: (isBooking ? rawData['País del cliente'] || rawData['Guest Country'] : rawData['País']) || null,
                    valorDolarDia: valorDolarDia,
                    comision: isBooking ? parseCurrency(rawData['Importe de la comisión'] || rawData['Commision Amount'] || rawData['Commiss Amount'], 'USD') / reservaData.alojamientos.length : (isAirbnb ? parseCurrency(rawData['Tarifa por servicio'], 'CLP') : null),
                    iva: isBooking ? Math.round(precioPorCabana * valorDolarDia * 0.19) : 0,
                    valorConIva: isBooking ? Math.round(precioPorCabana * valorDolarDia * 1.19) : (isAirbnb ? reservaData.valorCLP : valorCLPCalculado),
                    abono: 0,
                    pagado: false,
                    boleta: false,
                    estadoGestion: 'Pendiente Bienvenida',
                    estadoReporte: reservaData.estado, // Guardamos también el estado inicial del reporte
                    fechaUltimoReporte: admin.firestore.FieldValue.serverTimestamp()
                };
                batch.set(reservaRef, dataToSave, { merge: true });
            }
        }
        batch.delete(doc.ref);
    }

    if (clientesNuevos > 0 || reservasCreadas > 0 || reservasActualizadas > 0) {
        await batch.commit();
    }

    return {
        reportesEncontrados: rawDocsSnapshot.size,
        clientesNuevos,
        reservasCreadas,
        reservasActualizadas,
        mensaje: `Se procesaron ${rawDocsSnapshot.size} reportes.`
    };
}

module.exports = { processChannel };