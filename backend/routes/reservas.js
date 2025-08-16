    const express = require('express');
    const router = express.Router();

    /**
     * Define las rutas relacionadas con las reservas.
     * @param {admin.firestore.Firestore} db - La instancia de la base de datos de Firestore.
     * @returns {express.Router} El enrutador de Express con las rutas de reservas.
     */
    module.exports = (db) => {
      /**
       * GET /api/reservas
       * Obtiene una lista consolidada de todas las reservas.
       */
      router.get('/reservas', async (req, res) => {
        console.log("Petición recibida en /api/reservas"); // Log para saber que la ruta se activó
        try {
          const reservasBookingRef = db.collection('reservasBooking');
          const reservasSODCRef = db.collection('reservasSODC');

          const [bookingSnapshot, sodcSnapshot] = await Promise.all([
            reservasBookingRef.get(),
            reservasSODCRef.get()
          ]);

          console.log(`Se encontraron ${bookingSnapshot.size} reservas de Booking y ${sodcSnapshot.size} de SODC.`);

          const todasLasReservas = [];

          // Procesa las reservas de Booking de forma segura
          bookingSnapshot.forEach(doc => {
            const data = doc.data() || {}; // Asegura que 'data' sea un objeto aunque no haya datos
            todasLasReservas.push({
              id: doc.id,
              canal: 'Booking',
              // Usamos 'optional chaining' (?.) para evitar errores si un campo no existe
              nombre: data['Nombre del cliente (o clientes)'] ?? 'N/A',
              llegada: data['Entrada'] ?? 'N/A',
              salida: data['Salida'] ?? 'N/A',
              estado: data['Estado'] ?? 'N/A'
            });
          });

          // Procesa las reservas de SODC de forma segura
          sodcSnapshot.forEach(doc => {
            const data = doc.data() || {}; // Asegura que 'data' sea un objeto
            const nombreCompleto = `${data['Nombre'] || ''} ${data['Apellido'] || ''}`.trim();
            todasLasReservas.push({
              id: doc.id,
              canal: 'SODC',
              nombre: nombreCompleto || 'N/A',
              llegada: data['Día de llegada'] ?? 'N/A',
              salida: data['Día de salida'] ?? 'N/A',
              estado: data['Estado'] ?? 'N/A'
            });
          });
          
          console.log(`Procesamiento completado. Total de reservas: ${todasLasReservas.length}`);
          res.status(200).json(todasLasReservas);

        } catch (error) {
          // Si ocurre un error, lo registramos con más detalle
          console.error("ERROR DETALLADO al obtener las reservas:", error);
          res.status(500).json({ 
            error: 'Error interno del servidor al procesar las reservas.',
            detalle: error.message 
          });
        }
      });

      return router;
    };
    