const express = require('express');
const router = express.Router();

// La conexión a la base de datos (db) se pasa como un parámetro, no se importa.
module.exports = (db) => {
  router.get('/reservas', async (req, res) => {
    try {
      const snapshot = await db.collection('reservas').orderBy('fechaLlegada', 'desc').get();

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
          reservaIdOriginal: data.reservaIdOriginal || 'N/A',
          canal: data.canal || 'N/A',
          nombre: data.clienteNombre || 'Sin Nombre',
          telefono: data.clienteId || 'N/A', // El ID del cliente es el teléfono
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
