const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

module.exports = (db) => {
  /**
   * GET /reservas-por-fecha
   * Busca y devuelve un listado de reservas activas (NO canceladas) para una fecha específica.
   */
  router.get('/reservas-por-fecha', async (req, res) => {
    const { fecha } = req.query;
    if (!fecha) {
      return res.status(400).json({ error: 'Se requiere una fecha.' });
    }

    try {
      const targetDate = new Date(fecha + 'T00:00:00Z');
      const targetTimestamp = admin.firestore.Timestamp.fromDate(targetDate);

      // --- CAMBIO CLAVE AQUÍ ---
      // Añadimos un filtro para excluir las reservas canceladas.
      const q = db.collection('reservas')
        .where('fechaLlegada', '<=', targetTimestamp)
        .where('estado', '!=', 'Cancelada');

      const snapshot = await q.get();

      if (snapshot.empty) {
        return res.status(200).json([]);
      }

      const reservasActivas = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const fechaSalida = data.fechaSalida.toDate();
        if (fechaSalida > targetDate) {
           reservasActivas.push({
            id: doc.id,
            reservaIdOriginal: data.reservaIdOriginal,
            nombre: data.clienteNombre,
            llegada: data.fechaLlegada.toDate().toLocaleDateString('es-CL'),
          });
        }
      });
      res.status(200).json(reservasActivas);
    } catch (error) {
      console.error("Error al buscar reservas por fecha:", error);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  /**
   * GET /detalle-reserva/:reservaIdOriginal
   * Obtiene todos los detalles de un grupo de reservas por su ID original.
   */
  router.get('/detalle-reserva/:reservaIdOriginal', async (req, res) => {
    const { reservaIdOriginal } = req.params;
    try {
      const q = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
      const snapshot = await q.get();

      if (snapshot.empty) {
        return res.status(404).json({ error: 'No se encontraron reservas con ese ID.' });
      }

      const cabanas = [];
      let infoGeneral = {};
      let clienteId = null;

      snapshot.forEach(doc => {
        const data = doc.data();
        cabanas.push({
          alojamiento: data.alojamiento,
          valorCLP: data.valorCLP,
          valorOriginalCLP: data.valorOriginalCLP // Incluimos el valor original
        });
        clienteId = data.clienteId;
      });

      const primeraReserva = snapshot.docs[0].data();
      const clienteDoc = await db.collection('clientes').doc(clienteId).get();
      const clienteData = clienteDoc.exists ? clienteDoc.data() : {};

      infoGeneral = {
        reservaIdOriginal: primeraReserva.reservaIdOriginal,
        nombre: primeraReserva.clienteNombre,
        telefono: clienteData.phone || 'No disponible',
        llegada: primeraReserva.fechaLlegada.toDate().toLocaleDateString('es-CL'),
        salida: primeraReserva.fechaSalida.toDate().toLocaleDateString('es-CL'),
        totalNoches: primeraReserva.totalNoches,
        totalCLP: cabanas.reduce((sum, c) => sum + c.valorCLP, 0),
        totalOriginalCLP: cabanas.reduce((sum, c) => sum + (c.valorOriginalCLP || c.valorCLP), 0),
        valorManual: primeraReserva.valorManual || false,
      };

      res.status(200).json({ info: infoGeneral, cabanas: cabanas });

    } catch (error) {
      console.error("Error al obtener detalles de la reserva:", error);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  return router;
};
