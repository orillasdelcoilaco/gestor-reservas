const admin = require('firebase-admin');
const { getValorDolar } = require('./dolarService');
const { cleanPhoneNumber } = require('../utils/helpers'); // <-- 1. AÑADIMOS LA IMPORTACIÓN

//--- Funciones de ayuda (sin cambios)
function parseDate(dateValue) {
  if (!dateValue) return null;
  if (dateValue instanceof Date && !isNaN(dateValue)) return dateValue;
  if (typeof dateValue === 'number') {
    return new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0) + dateValue * 86400000);
  }
  if (typeof dateValue === 'string') {
    const date = new Date(dateValue.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
    if (!isNaN(date)) return date;
  }
  return null;
}

function parseCurrency(value, currency = 'USD') {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;

  if (currency === 'CLP') {
    const digitsOnly = value.replace(/\D/g, '');
    return parseInt(digitsOnly, 10) || 0;
  }

  const numberString = value.replace(/[^\d.,]/g, '');
  const cleanedForFloat = numberString.replace(/,/g, '');
  return parseFloat(cleanedForFloat) || 0;
}

// <-- 2. LA FUNCIÓN cleanPhoneNumber QUE ESTABA AQUÍ FUE ELIMINADA

function cleanCabanaName(cabanaName) {
  if (!cabanaName) return '';
  let cleanedName = cabanaName.replace(/(\d+)(\s*)$/, '$1').trim();
  return cleanedName;
}

//--- LÓGICA DE CONSOLIDACIÓN ESTABLE
async function processChannel(db, channel) {
  const rawCollectionName = `reportes_${channel.toLowerCase()}_raw`;
  const rawDocsSnapshot = await db.collection(rawCollectionName).get();

  if (rawDocsSnapshot.empty) {
    return `No hay nuevos reportes para procesar de ${channel}.`;
  }

  const allExistingReservations = new Map();
  const allReservasSnapshot = await db.collection('reservas').get();
  allReservasSnapshot.forEach(doc => {
    allExistingReservations.set(doc.id, doc.data());
  });

  const existingClientsByPhone = new Map();
  const allClientsSnapshot = await db.collection('clientes').get();
  allClientsSnapshot.forEach(doc => {
    const clientData = doc.data();
    if (clientData.phone) {
      existingClientsByPhone.set(clientData.phone, doc.id);
    }
  });

  const batch = db.batch();

  for (const doc of rawDocsSnapshot.docs) {
    const rawData = doc.data();
    const isBooking = channel === 'Booking';

    const alojamientosRaw = (isBooking ? rawData['Tipo de unidad'] : rawData['Alojamiento']) || '';
    const nombreCompletoRaw = (isBooking ? rawData['Nombre del cliente (o clientes)'] : `${rawData['Nombre'] || ''} ${rawData['Apellido'] || ''}`.trim()) || 'Cliente sin Nombre';

    const reservaData = {
      reservaldOriginal: (isBooking ? rawData['Número de reserva'] : rawData['Identidad'])?.toString(),
      nombreCompleto: nombreCompletoRaw,
      email: rawData['Email'] || rawData['Correo'] || null,
      telefono: cleanPhoneNumber(rawData['Teléfono'] || rawData['Número de teléfono']), // <-- Ya está usando la nueva función
      fechaLlegada: parseDate(isBooking ? rawData['Entrada'] : rawData['Día de llegada']),
      fechaSalida: parseDate(isBooking ? rawData['Salida'] : rawData['Día de salida']),
      estado: isBooking ? (rawData['Estado'] === 'ok' ? 'Confirmada' : 'Cancelada') : rawData['Estado'],
      alojamientos: alojamientosRaw.toString().split(',').map(c => cleanCabanaName(c.trim()))
    };

    if (!reservaData.fechaLlegada || !reservaData.fechaSalida) continue;

    for (const cabana of reservaData.alojamientos) {
      if (!cabana) continue;

      const idCompuesto = `${channel.toUpperCase()}_${reservaData.reservaldOriginal}_${cabana.replace(/\s+/g, '')}`;
      const reservaRef = db.collection('reservas').doc(idCompuesto);
      let clienteld;

      const existingReservation = allExistingReservations.get(idCompuesto);

      if (existingReservation && existingReservation.clienteld) {
        clienteld = existingReservation.clienteld;
      } else if (reservaData.telefono && existingClientsByPhone.has(reservaData.telefono)) {
        clienteld = existingClientsByPhone.get(reservaData.telefono);
      } else {
        const newClientRef = db.collection('clientes').doc();
        clienteld = newClientRef.id;
        batch.set(newClientRef, {
          firstname: reservaData.nombreCompleto.split(' ')[0],
          lastname: reservaData.nombreCompleto.split(' ').slice(1).join(' '),
          email: reservaData.email,
          phone: reservaData.telefono
        });
        if (reservaData.telefono) existingClientsByPhone.set(reservaData.telefono, clienteld);
      }

      let valorCLP = parseCurrency(isBooking ? rawData['Precio'] : rawData['Total'], isBooking ? 'USD' : 'CLP');
      if (isBooking) {
        const valorDolarDia = await getValorDolar(db, reservaData.fechaLlegada);
        const precioPorCabanaUSD = reservaData.alojamientos.length > 0 ? (valorCLP / reservaData.alojamientos.length) : 0;
        valorCLP = Math.round(precioPorCabanaUSD * valorDolarDia * 1.19);
      }

      const totalNoches = Math.round((reservaData.fechaSalida - reservaData.fechaLlegada) / (1000 * 60 * 60 * 24));

      const dataToSave = {
        reservaldOriginal: reservaData.reservaldOriginal,
        clienteld: clienteld,
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
        valorOriginal: parseCurrency(isBooking ? rawData['Precio'] : rawData['Total'], isBooking ? 'USD' : 'CLP'),
        valorCLP: valorCLP,
      };

      if (existingReservation) {
        if (existingReservation.valorManual) {
          dataToSave.valorCLP = existingReservation.valorCLP;
          dataToSave.valorOriginalCLP = existingReservation.valorOriginalCLP;
          dataToSave.valorManual = true;
        }
        if (existingReservation.nombreManual) {
          dataToSave.clienteNombre = existingReservation.clienteNombre;
          dataToSave.nombreManual = true;
        }
      }

      batch.set(reservaRef, dataToSave, { merge: true });
    }
    batch.delete(doc.ref);
  }

  await batch.commit();

  return `Se procesaron y consolidaron ${rawDocsSnapshot.size} registros de ${channel}.`;
}

module.exports = {
  processChannel,
};