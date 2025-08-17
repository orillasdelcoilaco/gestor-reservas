/**
 * consolidationService.js
 * * Este servicio se encarga de procesar los datos brutos de los reportes
 * y consolidarlos en las colecciones finales 'clientes' y 'reservas'.
 */

// --- CORRECCIÓN: Usar una ruta absoluta para mayor robustez ---
const path = require('path');
const { db } = require(path.join(__dirname, '..', 'config', 'firebase')); 

// Suponiendo que tienes un dolarService, aunque no se use en esta lógica específica.
// const { getDollarValue } = require('./dolarService');

// --- NUEVA FUNCIÓN ---
// Normaliza el número de teléfono para asegurar que comience con +56.
// Maneja varios formatos comunes en Chile.
const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  
  // Elimina espacios, guiones y el signo '+' si ya existe al principio
  let cleanPhone = phone.toString().replace(/[\s\-+]/g, '');

  // Si el número empieza con '569', ya es casi correcto, solo le falta el '+'
  if (cleanPhone.startsWith('569')) {
    return `+${cleanPhone}`;
  }
  
  // Si empieza con '9' y tiene 9 dígitos, es un móvil al que le falta el '56'
  if (cleanPhone.startsWith('9') && cleanPhone.length === 9) {
    return `+56${cleanPhone}`;
  }

  // Si tiene 8 dígitos, probablemente le falta el '9' inicial y el '56'
  if (cleanPhone.length === 8) {
    return `+569${cleanPhone}`;
  }

  // Fallback para otros casos, asumiendo que es un número que necesita el prefijo
  if (!cleanPhone.startsWith('56')) {
    return `+56${cleanPhone}`;
  }

  return `+${cleanPhone}`;
};

/**
 * Procesa los datos de las colecciones _raw, los limpia, y los guarda
 * en las colecciones finales: 'clientes' y 'reservas'.
 */
const consolidateData = async () => {
  console.log("Iniciando consolidación de datos...");

  const sodcSnapshot = await db.collection('reportes_sodc_raw').get();
  const bookingSnapshot = await db.collection('reportes_booking_raw').get();
  const clients = new Map(); // Usamos un Map para manejar clientes únicos por teléfono

  // 1. Procesar y consolidar clientes
  console.log("Procesando clientes de SODC...");
  sodcSnapshot.forEach(doc => {
    const data = doc.data();
    const phone = normalizePhoneNumber(data.customer_phone);
    if (phone && !clients.has(phone)) {
      clients.set(phone, {
        nombre: data.customer_name || 'Sin Nombre',
        telefono: phone,
        email: data.customer_email || ''
      });
    }
  });
  
  // (Opcional) Repetir el proceso para clientes de Booking si es necesario
  // ...

  // Guardar clientes únicos en Firestore
  const clientBatch = db.batch();
  for (const [phone, clientData] of clients.entries()) {
    const clientRef = db.collection('clientes').doc(phone); 
    clientBatch.set(clientRef, clientData, { merge: true });
  }
  await clientBatch.commit();
  console.log(`${clients.size} clientes únicos guardados.`);

  // 2. Procesar y consolidar reservas
  console.log("Procesando reservas...");
  const reservationBatch = db.batch();

  for (const doc of sodcSnapshot.docs) {
    const data = doc.data();
    const bookingId = data.booking_id; 

    if (bookingId) {
      const reservationRef = db.collection('reservas').doc(bookingId.toString());
      const clientPhone = normalizePhoneNumber(data.customer_phone);
      
      const clientInfo = clients.get(clientPhone);
      const clientName = clientInfo ? clientInfo.nombre : 'Cliente no encontrado';

      reservationBatch.set(reservationRef, {
        fecha_checkin: new Date(data.checkin_date),
        fecha_checkout: new Date(data.checkout_date),
        alojamiento: data.listing_name || 'Alojamiento no especificado',
        telefono_cliente: clientPhone,
        nombre_cliente: clientName,
        origen: 'SODC',
        precio_total: parseFloat(data.total_payout) || 0,
        estado: data.status || 'Desconocido',
      }, { merge: true });
    }
  }

  // (Opcional) Repetir el proceso para reservas de Booking
  // ...

  await reservationBatch.commit();
  console.log("Reservas consolidadas y guardadas.");
  
  return { message: "Datos consolidados exitosamente." };
};

module.exports = { consolidateData };
