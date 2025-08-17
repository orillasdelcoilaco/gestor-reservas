const express = require('express');
const router = express.Router();

module.exports = (db) => {
  /**
   * GET /api/reservas
   * Obtiene la lista de reservas desde la colección consolidada 'reservas'.
   */
  router.get('/reservas', async (req, res) => {
    try {
      const reservasRef = db.collection('reservas');
      const snapshot = await reservasRef.get();

      if (snapshot.empty) {
        return res.status(200).json([]); // Devuelve un array vacío si no hay reservas
      }

      const todasLasReservas = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // Formateamos las fechas de Timestamp a un formato legible
        const llegada = data.fechaLlegada ? data.fechaLlegada.toDate().toLocaleDateString('es-CL') : 'N/A';
        const salida = data.fechaSalida ? data.fechaSalida.toDate().toLocaleDateString('es-CL') : 'N/A';

        todasLasReservas.push({
          id: doc.id,
          canal: data.canal || 'N/A',
          nombre: data.clienteId || 'N/A', // Temporalmente mostramos el ID del cliente
          llegada: llegada,
          salida: salida,
          estado: data.estado || 'N/A',
          alojamiento: data.alojamiento || 'N/A'
        });
      });

      res.status(200).json(todasLasReservas);
    } catch (error) {
      console.error("Error al obtener las reservas consolidadas:", error);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  return router;
};
