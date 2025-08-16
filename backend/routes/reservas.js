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
       * Obtiene una lista consolidada de todas las reservas de las colecciones
       * 'reservasBooking' y 'reservasSODC'.
       */
      router.get('/reservas', async (req, res) => {
        try {
          // Referencias a las colecciones en Firestore
          const reservasBookingRef = db.collection('reservasBooking');
          const reservasSODCRef = db.collection('reservasSODC');

          // Realiza ambas consultas a la base de datos en paralelo para mayor eficiencia
          const [bookingSnapshot, sodcSnapshot] = await Promise.all([
            reservasBookingRef.get(),
            reservasSODCRef.get()
          ]);

          const todasLasReservas = [];

          // Procesa los documentos de la colección 'reservasBooking'
          bookingSnapshot.forEach(doc => {
            const data = doc.data();
            // Normaliza los datos a un formato unificado
            todasLasReservas.push({
              id: doc.id,
              canal: 'Booking',
              nombre: data['Nombre del cliente (o clientes)'] || 'N/A',
              llegada: data['Entrada'] || 'N/A',
              salida: data['Salida'] || 'N/A',
              estado: data['Estado'] || 'N/A'
            });
          });

          // Procesa los documentos de la colección 'reservasSODC'
          sodcSnapshot.forEach(doc => {
            const data = doc.data();
            // Normaliza los datos a un formato unificado
            todasLasReservas.push({
              id: doc.id,
              canal: 'SODC',
              nombre: `${data['Nombre'] || ''} ${data['Apellido'] || ''}`.trim() || 'N/A',
              llegada: data['Día de llegada'] || 'N/A',
              salida: data['Día de salida'] || 'N/A',
              estado: data['Estado'] || 'N/A'
            });
          });

          // Envía la lista consolidada de reservas como respuesta
          res.status(200).json(todasLasReservas);

        } catch (error) {
          console.error("Error al obtener las reservas:", error);
          res.status(500).json({ error: 'Error interno del servidor al obtener las reservas.' });
        }
      });

      return router;
    };
    