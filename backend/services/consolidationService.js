// backend/services/consolidationService.js - CÓDIGO FINAL

const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');
// Importamos la nueva función que creamos
const { createGoogleContact, getContactPhoneByName } = require('./googleContactsService');

// --- Funciones de ayuda (sin cambios) ---
function cleanCabanaName(cabanaName) { /* ...código sin cambios... */ }
function parseDate(dateValue) { /* ...código sin cambios... */ }
function parseCurrency(value, currency = 'USD') { /* ...código sin cambios... */ }
function cleanPhoneNumber(phone) { /* ...código sin cambios... */ }

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
            reservaIdOriginal: (isBooking ? rawData['Número de reserva'] : rawData['Identidad'])?.toString(),
            nombreCompleto: nombreCompletoRaw,
            email: rawData['Email'] || rawData['Correo'] || null,
            telefono: telefonoReporte || genericPhone, // Usamos el genérico si no viene
            fechaLlegada: parseDate(isBooking ? rawData['Entrada'] : rawData['Día de llegada']),
            fechaSalida: parseDate(isBooking ? rawData['Salida'] : rawData['Día de salida']),
            estado: isBooking ? (rawData['Estado'] === 'ok' ? 'Confirmada' : 'Cancelada') : rawData['Estado'],
            alojamientos: alojamientosLimpios
        };

        if (!reservaData.fechaLlegada || !reservaData.fechaSalida) continue;
        
        for (const cabana of reservaData.alojamientos) {
             if (!cabana) continue;
            
            const idCompuesto = `${channel.toUpperCase()}_${reservaData.reservaIdOriginal}_${cabana.replace(/\s+/g, '')}`;
            const reservaRef = db.collection('reservas').doc(idCompuesto);
            
            let clienteId;
            const existingReservation = allExistingReservations.get(idCompuesto);
            
            if (existingReservation) reservasActualizadas++; else reservasCreadas++;

            if (existingReservation && existingReservation.clienteId) {
                clienteId = existingReservation.clienteId;
                const clienteRef = db.collection('clientes').doc(clienteId);
                const clienteDoc = await clienteRef.get();
                const clienteData = clienteDoc.exists() ? clienteDoc.data() : {};

                // --- INICIO DE LA LÓGICA DE SINCRONIZACIÓN ---
                // 1. Si el reporte trae un número real y en Firebase teníamos el genérico, actualizamos.
                if (telefonoReporte && clienteData.phone === genericPhone) {
                    console.log(`Actualizando teléfono del cliente ${clienteId} desde el reporte a: ${telefonoReporte}`);
                    batch.update(clienteRef, { phone: telefonoReporte });
                } 
                // 2. Si en Firebase tenemos el genérico, preguntamos a Google Contacts si tiene uno mejor.
                else if (clienteData.phone === genericPhone) {
                    const nombreContactoGoogle = `${reservaData.nombreCompleto} ${channel} ${reservaData.reservaIdOriginal}`;
                    const telefonoReal = await getContactPhoneByName(db, nombreContactoGoogle);
                    
                    if (telefonoReal && telefonoReal !== genericPhone) {
                        console.log(`¡Teléfono actualizado encontrado en Google! Sincronizando ${telefonoReal} para el cliente ${clienteId}.`);
                        batch.update(clienteRef, { phone: telefonoReal });
                    }
                }
                // --- FIN DE LA LÓGICA DE SINCRONIZACIÓN ---

            } else if (reservaData.telefono !== genericPhone && existingClientsByPhone.has(reservaData.telefono)) {
                clienteId = existingClientsByPhone.get(reservaData.telefono);
            } else {
                clientesNuevos++;
                const newClientRef = db.collection('clientes').doc();
                clienteId = newClientRef.id;
                batch.set(newClientRef, {
                    firstname: reservaData.nombreCompleto.split(' ')[0],
                    lastname: reservaData.nombreCompleto.split(' ').slice(1).join(' '),
                    email: reservaData.email,
                    phone: reservaData.telefono
                });
                
                if (reservaData.telefono !== genericPhone) {
                    existingClientsByPhone.set(reservaData.telefono, clienteId);
                }
                
                const contactData = {
                    name: `${reservaData.nombreCompleto} ${channel} ${reservaData.reservaIdOriginal}`,
                    phone: reservaData.telefono,
                    email: reservaData.email
                };
                createGoogleContact(db, contactData);
            }

            // ... (resto del código sin cambios) ...
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