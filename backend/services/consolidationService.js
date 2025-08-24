// backend/services/consolidationService.js - CÓDIGO ACTUALIZADO Y LIMPIO

const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');
const { createGoogleContact, getContactPhoneByName } = require('./googleContactsService');
// Importamos todas las funciones de ayuda desde el archivo central
const { cleanCabanaName, parseDate, parseCurrency, cleanPhoneNumber } = require('../utils/helpers');

async function processChannel(db, channel) {
    const rawCollectionName = `reportes_${channel.toLowerCase()}_raw`;
    const rawDocsSnapshot = await db.collection(rawCollectionName).get();
    
    if (rawDocsSnapshot.empty) {
        return { reportesEncontrados: 0, clientesNuevos: 0, reservasCreadas: 0, reservasActualizadas: 0, mensaje: `No hay nuevos reportes de ${channel} para procesar.` };
    }

    let clientesNuevos = 0, reservasCreadas = 0, reservasActualizadas = 0;

    const allExistingReservations = new Map();
    const allReservasSnapshot = await db.collection('reservas').get();
    allReservasSnapshot.forEach(doc => allExistingReservations.set(doc.id, doc.data()));

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
        
        const alojamientosRaw = (isBooking ? rawData['Tipo de unidad'] : rawData['Alojamiento']);
        const alojamientosLimpios = (alojamientosRaw || "").toString().split(',').map(c => cleanCabanaName(c));
        const nombreCompletoRaw = (isBooking ? rawData['Nombre del cliente (o clientes)'] : `${rawData['Nombre'] || ''} ${rawData['Apellido'] || ''}`.trim()) || "Cliente sin Nombre";
        
        let telefonoReporte = cleanPhoneNumber(rawData['Teléfono'] || rawData['Número de teléfono']);

        const reservaData = {
            reservaIdOriginal: (isBooking ? rawData['Número de reserva'] : rawData['Identidad'])?.toString() || null,
            nombreCompleto: nombreCompletoRaw,
            email: rawData['Email'] || rawData['Correo'] || null,
            telefono: telefonoReporte || genericPhone,
            fechaLlegada: parseDate(isBooking ? rawData['Entrada'] : rawData['Día de llegada']),
            fechaSalida: parseDate(isBooking ? rawData['Salida'] : rawData['Día de salida']),
            estado: isBooking ? (rawData['Estado'] === 'ok' ? 'Confirmada' : 'Cancelada') : rawData['Estado'],
            alojamientos: alojamientosLimpios,
            pais: (isBooking ? rawData['País del cliente'] : rawData['País']) || null
        };

        if (!reservaData.fechaLlegada || !reservaData.fechaSalida || !reservaData.reservaIdOriginal) continue;
        
        for (const cabana of reservaData.alojamientos) {
             if (!cabana) continue;
            
            const idCompuesto = `${channel.toUpperCase()}_${reservaData.reservaIdOriginal}_${cabana.replace(/\s+/g, '')}`;
            const reservaRef = db.collection('reservas').doc(idCompuesto);
            
            let clienteId;
            const existingReservation = allExistingReservations.get(idCompuesto);
            
            if (existingReservation) reservasActualizadas++; else reservasCreadas++;

            if (existingReservation && existingReservation.clienteId) {
                clienteId = existingReservation.clienteId;
            } else if (reservaData.telefono !== genericPhone && existingClientsByPhone.has(reservaData.telefono)) {
                clienteId = existingClientsByPhone.get(reservaData.telefono);
            } else {
                clientesNuevos++;
                const newClientRef = db.collection('clientes').doc();
                clienteId = newClientRef.id;

                const contactData = {
                    name: `${reservaData.nombreCompleto} ${channel} ${reservaData.reservaIdOriginal}`,
                    phone: reservaData.telefono,
                    email: reservaData.email
                };
                
                const syncSuccess = await createGoogleContact(db, contactData);

                batch.set(newClientRef, {
                    firstname: reservaData.nombreCompleto.split(' ')[0],
                    lastname: reservaData.nombreCompleto.split(' ').slice(1).join(' '),
                    email: reservaData.email,
                    phone: reservaData.telefono,
                    googleContactSynced: syncSuccess
                });
                
                if (reservaData.telefono !== genericPhone) {
                    existingClientsByPhone.set(reservaData.telefono, clienteId);
                }
            }
            
            const valorOriginal = parseCurrency(isBooking ? rawData['Precio'] : rawData['Total'], isBooking ? 'USD' : 'CLP');
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
                fechaReserva: parseDate(isBooking ? rawData['Fecha de reserva'] : rawData['Fecha']),
                fechaLlegada: admin.firestore.Timestamp.fromDate(reservaData.fechaLlegada),
                fechaSalida: admin.firestore.Timestamp.fromDate(reservaData.fechaSalida),
                totalNoches: totalNoches > 0 ? totalNoches : 1,
                invitados: parseInt(isBooking ? rawData['Adultos/Invitados'] : rawData['Personas'] || 0),
                alojamiento: cabana,
                monedaOriginal: isBooking ? 'USD' : 'CLP',
                valorOriginal: precioPorCabana,
                valorCLP: valorCLPCalculado,
                correo: reservaData.email,
                telefono: reservaData.telefono,
                pais: reservaData.pais,
                valorDolarDia: valorDolarDia,
                comision: isBooking ? parseCurrency(rawData['Importe de la comisión'], 'USD') / reservaData.alojamientos.length : null,
                iva: isBooking ? Math.round(precioPorCabana * valorDolarDia * 0.19) : null,
                valorConIva: isBooking ? Math.round(precioPorCabana * valorDolarDia * 1.19) : valorCLPCalculado,
                abono: 0,
                fechaAbono: null,
                fechaPago: null,
                pagado: false,
                pendiente: valorCLPCalculado,
                boleta: false
            };
            
            if (existingReservation) {
                if (existingReservation.valorManual) dataToSave.valorCLP = existingReservation.valorCLP;
                if (existingReservation.nombreManual) dataToSave.clienteNombre = existingReservation.clienteNombre;
                dataToSave.abono = existingReservation.abono || 0;
                dataToSave.fechaAbono = existingReservation.fechaAbono || null;
                dataToSave.pagado = existingReservation.pagado || false;
                dataToSave.pendiente = existingReservation.pendiente === undefined ? dataToSave.valorCLP - dataToSave.abono : existingReservation.pendiente;
                dataToSave.boleta = existingReservation.boleta || false;
            }
            batch.set(reservaRef, dataToSave, { merge: true });
        }
        batch.delete(doc.ref);
    }

    await batch.commit();
    
    return {
        reportesEncontrados: rawDocsSnapshot.size,
        clientesNuevos,
        reservasCreadas,
        reservasActualizadas,
        mensaje: `Se procesaron ${rawDocsSnapshot.size} reportes.`
    };
}

module.exports = { processChannel };