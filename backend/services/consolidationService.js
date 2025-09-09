// backend/services/consolidationService.js - CÓDIGO ACTUALIZADO Y LIMPIO

const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');
const { createGoogleContact, getContactPhoneByName } = require('./googleContactsService');
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

    const allExistingReservations = new Map();
    const allReservasSnapshot = await db.collection('reservas').get();
    allReservasSnapshot.forEach(doc => allExistingReservations.set(doc.id, doc.data()));

    const existingClientsByPhone = new Map();
    const allClientsSnapshot = await db.collection('clientes').get();
    allClientsSnapshot.forEach(doc => {
        const clientData = doc.data();
        if (clientData.phone) existingClientsByPhone.set(clientData.phone, doc.id);
    });

    const airbnbReservationsByOriginalId = new Map();
    if (channel === 'Airbnb') {
        allExistingReservations.forEach((data, id) => {
            if (data.canal === 'Airbnb') {
                airbnbReservationsByOriginalId.set(data.reservaIdOriginal, { id, data });
            }
        });
    }

    // --- INICIO DE LA MODIFICACIÓN: Cargar reservas obsoletas ---
    const obsoleteReservations = new Map();
    const obsoleteSnapshot = await db.collection('reservas_obsoletas').get();
    obsoleteSnapshot.forEach(doc => obsoleteReservations.set(doc.id, doc.data()));
    // --- FIN DE LA MODIFICACIÓN ---

    const batch = db.batch();
    const genericPhone = '56999999999';

    for (const doc of rawDocsSnapshot.docs) {
        const rawData = doc.data();
        const isBooking = channel === 'Booking';
        const isSodc = channel === 'SODC';
        const isAirbnb = channel === 'Airbnb';

        if (isAirbnb) {
            if (rawData['Tipo'] !== 'Reservación') continue;

            const parseAirbnbDate = (dateStr) => {
                if (!dateStr || typeof dateStr !== 'string' || !/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return null;
                const [month, day, year] = dateStr.split('/');
                const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`;
                const date = new Date(isoDate);
                return !isNaN(date) ? date : null;
            };

            const reservaIdOriginal = rawData['Código de confirmación'];
            const cabanaCorrecta = extractCabanaNameFromAirbnb(rawData['Anuncio']);
            const fechaLlegada = parseAirbnbDate(rawData['Fecha de inicio']);
            const fechaSalida = parseAirbnbDate(rawData['Fecha de finalización']);

            if (!fechaLlegada || !fechaSalida || !reservaIdOriginal || !cabanaCorrecta) {
                console.warn(`Saltando fila de Airbnb por datos inválidos. Código: ${reservaIdOriginal}`);
                continue;
            }
            
            const idCompuestoCorrecto = `AIRBNB_${reservaIdOriginal}_${cabanaCorrecta.replace(/\s+/g, '')}`;

            // --- INICIO DE LA MODIFICACIÓN: Comprobación de obsolescencia ---
            if (obsoleteReservations.has(idCompuestoCorrecto)) {
                console.log(`Saltando reserva obsoleta (Airbnb): ${idCompuestoCorrecto}. Redirigida a ${obsoleteReservations.get(idCompuestoCorrecto).nuevaReservaId}`);
                batch.delete(doc.ref);
                continue;
            }
            // --- FIN DE LA MODIFICACIÓN ---

            const existingReservation = airbnbReservationsByOriginalId.get(reservaIdOriginal);

            if (existingReservation) {
                const idCompuestoIncorrecto = existingReservation.id;
                if (idCompuestoIncorrecto !== idCompuestoCorrecto) {
                    console.log(`Moviendo reserva Airbnb ${reservaIdOriginal}: de ${idCompuestoIncorrecto} a ${idCompuestoCorrecto}`);
                    
                    const oldReservaRef = db.collection('reservas').doc(idCompuestoIncorrecto);
                    batch.delete(oldReservaRef);

                    const newReservaRef = db.collection('reservas').doc(idCompuestoCorrecto);
                    const newData = { ...existingReservation.data, alojamiento: cabanaCorrecta };
                    batch.set(newReservaRef, newData, { merge: true });

                    reservasActualizadas++;
                }
            } else {
                reservasCreadas++;
                clientesNuevos++;
                const newClientRef = db.collection('clientes').doc();
                const clienteId = newClientRef.id;
                const nombreCompleto = rawData['Huésped'] || 'Cliente Airbnb';

                const contactData = {
                    name: `${nombreCompleto} Airbnb ${reservaIdOriginal}`,
                    phone: genericPhone,
                    email: null
                };
                const syncSuccess = await createGoogleContact(db, contactData);

                batch.set(newClientRef, {
                    firstname: nombreCompleto.split(' ')[0],
                    lastname: nombreCompleto.split(' ').slice(1).join(' '),
                    email: null,
                    phone: genericPhone,
                    googleContactSynced: syncSuccess
                });
                
                const dataToSave = {
                    reservaIdOriginal,
                    clienteId,
                    clienteNombre: nombreCompleto,
                    canal: 'Airbnb',
                    estado: 'Confirmada',
                    fechaReserva: parseAirbnbDate(rawData['Fecha de la reservación']),
                    fechaLlegada: admin.firestore.Timestamp.fromDate(fechaLlegada),
                    fechaSalida: admin.firestore.Timestamp.fromDate(fechaSalida),
                    totalNoches: parseInt(rawData['Noches'] || 0),
                    invitados: 0,
                    alojamiento: cabanaCorrecta,
                    monedaOriginal: 'CLP',
                    valorOriginal: parseCurrency(rawData['Ingresos brutos'], 'CLP'),
                    valorCLP: parseCurrency(rawData['Ingresos brutos'], 'CLP'),
                    correo: null,
                    telefono: genericPhone,
                    pais: null,
                    valorDolarDia: null,
                    comision: parseCurrency(rawData['Tarifa por servicio'], 'CLP'),
                    iva: 0,
                    valorConIva: parseCurrency(rawData['Ingresos brutos'], 'CLP'),
                    abono: 0,
                    fechaAbono: null,
                    fechaPago: null,
                    pagado: false,
                    pendiente: parseCurrency(rawData['Ingresos brutos'], 'CLP'),
                    boleta: false,
                    estadoGestion: 'Pendiente Bienvenida'
                };
                
                const reservaRef = db.collection('reservas').doc(idCompuestoCorrecto);
                batch.set(reservaRef, dataToSave, { merge: true });
            }

        } else {
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

                // --- INICIO DE LA MODIFICACIÓN: Comprobación de obsolescencia ---
                if (obsoleteReservations.has(idCompuesto)) {
                    console.log(`Saltando reserva obsoleta (${channel}): ${idCompuesto}. Redirigida a ${obsoleteReservations.get(idCompuesto).nuevaReservaId}`);
                    continue; // No borramos el doc.ref aquí porque podría haber otras cabañas en la misma fila
                }
                // --- FIN DE LA MODIFICACIÓN ---

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
                    dataToSave.estadoGestion = existingReservation.estadoGestion || 'Pendiente Bienvenida';
                } else {
                    dataToSave.estadoGestion = 'Pendiente Bienvenida';
                }

                batch.set(reservaRef, dataToSave, { merge: true });
            }
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