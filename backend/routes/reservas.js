const express = require('express');
const router = express.Router();

module.exports = (db) => {
  /**
   * GET /api/reservas
   * Obtiene la lista de reservas consolidadas, ordenadas por fecha de llegada.
   */
  router.get('/reservas', async (req, res) => {
    try {
      const reservasRef = db.collection('reservas');
      // **CORRECCIÓN: Ordenamos por fecha de llegada, de más nueva a más antigua**
      const snapshot = await reservasRef.orderBy('fechaLlegada', 'desc').get();

      if (snapshot.empty) {
        return res.status(200).json([]);
      }

      const todasLasReservas = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const llegada = data.fechaLlegada ? data.fechaLlegada.toDate().toLocaleDateString('es-CL') : 'N/A';
        const salida = data.fechaSalida ? data.fechaSalida.toDate().toLocaleDateString('es-CL') : 'N/A';

        todasLasReservas.push({
          id: doc.id,
          canal: data.canal || 'N/A',
          // **CORRECCIÓN: Usamos el campo 'clienteNombre' que guardamos**
          nombre: data.clienteNombre || 'Sin Nombre',
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
