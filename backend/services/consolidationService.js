// backend/services/consolidationService.js

const { db } = require('../config/firebase');
const { getDollarValue } = require('./dolarService');

// --- NUEVA FUNCIÓN ---
// Normaliza el número de teléfono para que siempre empiece con "+56"
const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  let cleanPhone = phone.toString().replace(/\s+/g, '').replace('+', '');
  if (cleanPhone.startsWith('569')) {
    cleanPhone = cleanPhone.substring(2);
  } else if (cleanPhone.startsWith('9')) {
    // Si empieza con 9, es probable que sea un móvil chileno
    cleanPhone = cleanPhone.substring(1);
  }
  
  // Si después de limpiar, tiene 8 dígitos, asumimos que es un móvil sin el 9 inicial
  if (cleanPhone.length === 8) {
      cleanPhone = '9' + cleanPhone;
  }

  if (cleanPhone.startsWith('56')) {
    return `+${cleanPhone}`;
  }
  
  // Asumimos que es un número local de 9 dígitos que necesita el prefijo
  if (cleanPhone.length === 9 && cleanPhone.startsWith('9')) {
    return `+56${cleanPhone}`;
  }

  return `+56${cleanPhone}`; // Fallback para otros casos
};


// --- FUNCIÓN PRINCIPAL MODIFICADA ---
const consolidateData = async () => {
  // ... (código existente para obtener reportes raw)
  const sodcSnapshot = await db.collection('reportes_sodc_raw').get();
  const bookingSnapshot = await db.collection('reportes_booking_raw').get();
  const clients = new Map();

  // --- Procesamiento de clientes (AQUÍ SE USA LA NORMALIZACIÓN) ---
  sodcSnapshot.forEach(doc => {
    const data = doc.data();
    const phone = normalizePhoneNumber(data.customer_phone); // <--- CORRECCIÓN
    if (phone && !clients.has(phone)) {
      clients.set(phone, {
        nombre: data.customer_name,
        telefono: phone,
        email: data.customer_email || ''
      });
    }
  });
  
  // ... (lógica similar para clientes de Booking si aplica)

  // Guardar clientes únicos
  const clientBatch = db.batch();
  for (const [phone, clientData] of clients.entries()) {
    const clientRef = db.collection('clientes').doc(phone);
    clientBatch.set(clientRef, clientData, { merge: true });
  }
  await clientBatch.commit();
  console.log('Clientes consolidados y guardados.');

  // --- Procesamiento de reservas (AQUÍ SE AÑADE EL NOMBRE DEL CLIENTE) ---
  const reservationBatch = db.batch();

  for (const doc of sodcSnapshot.docs) {
    const data = doc.data();
    const bookingId = data.booking_id;
    if (bookingId) {
      const reservationRef = db.collection('reservas').doc(bookingId);
      const clientPhone = normalizePhoneNumber(data.customer_phone); // <--- CORRECCIÓN
      const clientName = clients.get(clientPhone)?.nombre || 'Nombre no encontrado'; // <--- CORRECCIÓN

      reservationBatch.set(reservationRef, {
        fecha_checkin: new Date(data.checkin_date),
        fecha_checkout: new Date(data.checkout_date),
        alojamiento: data.listing_name, // <-- DATO CLAVE
        telefono_cliente: clientPhone,
        nombre_cliente: clientName, // <-- AÑADIDO
        origen: 'SODC',
        // ... otros campos que necesites
      }, { merge: true });
    }
  }

  // ... (lógica similar para reservas de Booking)

  await reservationBatch.commit();
  console.log('Reservas consolidadas y guardadas.');
  
  return { message: "Datos consolidados exitosamente." };
};

module.exports = { consolidateData };