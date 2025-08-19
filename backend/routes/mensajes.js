const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

module.exports = (db) => {
  /**
   * GET /api/mensajes/reservas-por-fecha
   * Busca y devuelve un listado de reservas activas para una fecha específica.
   */
  router.get('/reservas-por-fecha', async (req, res) => {
    const { fecha } = req.query; // La fecha vendrá como 'YYYY-MM-DD'

    if (!fecha) {
      return res.status(400).json({ error: 'Se requiere una fecha.' });
    }

    try {
      const targetDate = new Date(fecha + 'T00:00:00Z'); // Aseguramos que sea UTC
      const targetTimestamp = admin.firestore.Timestamp.fromDate(targetDate);

      // Buscamos reservas cuya fecha de llegada sea anterior o igual a la fecha objetivo
      // Y cuya fecha de salida sea posterior a la fecha objetivo
      const q = db.collection('reservas')
        .where('fechaLlegada', '<=', targetTimestamp);

      const snapshot = await q.get();

      if (snapshot.empty) {
        return res.status(200).json([]);
      }

      const reservasActivas = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const fechaSalida = data.fechaSalida.toDate();

        // Filtramos en el servidor porque Firestore no permite dos '<' en campos diferentes
        if (fechaSalida > targetDate) {
           reservasActivas.push({
            id: doc.id,
            reservaIdOriginal: data.reservaIdOriginal,
            nombre: data.clienteNombre,
            llegada: data.fechaLlegada.toDate().toLocaleDateString('es-CL'),
            salida: fechaSalida.toLocaleDateString('es-CL'),
            alojamiento: data.alojamiento
          });
        }
      });

      res.status(200).json(reservasActivas);

    } catch (error) {
      console.error("Error al buscar reservas por fecha:", error);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  return router;
};
