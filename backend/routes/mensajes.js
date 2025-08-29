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

        if (fechaSalida > targetDate && data.estado !== 'Cancelada') {
           reservasActivas.push({
            id: doc.id, // Se devuelve el ID completo del documento
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
   * Obtiene todos los detalles de un grupo de reservas y suma automáticamente los abonos.
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
      let clienteId = null;
      let totalAbonado = 0;

      // Usamos un bucle for...of para poder usar await dentro
      for (const doc of snapshot.docs) {
        const data = doc.data();
        cabanas.push({
          alojamiento: data.alojamiento,
          valorCLP: data.valorCLP
        });
        clienteId = data.clienteId;

        // --- LÓGICA PARA SUMAR ABONOS DE LA SUBCOLECCIÓN ---
        const transaccionesRef = doc.ref.collection('transacciones');
        const transaccionesSnapshot = await transaccionesRef.where('tipo', '==', 'Abono').get();
        
        if (!transaccionesSnapshot.empty) {
          transaccionesSnapshot.forEach(transDoc => {
            totalAbonado += transDoc.data().monto || 0;
          });
        }
      }

      const primeraReserva = snapshot.docs[0].data();
      const clienteDoc = await db.collection('clientes').doc(clienteId).get();
      const clienteData = clienteDoc.exists ? clienteDoc.data() : {};

      const infoGeneral = {
        reservaIdOriginal: primeraReserva.reservaIdOriginal,
        nombre: primeraReserva.clienteNombre,
        telefono: clienteData.phone || 'No disponible',
        llegada: primeraReserva.fechaLlegada.toDate(),
        salida: primeraReserva.fechaSalida.toDate(),
        totalNoches: primeraReserva.totalNoches,
        totalCLP: cabanas.reduce((sum, c) => sum + c.valorCLP, 0),
        totalAbonado: totalAbonado, // <-- Se añade el total calculado
        canal: primeraReserva.canal,
        valorOriginalUSD: primeraReserva.monedaOriginal === 'USD' ? primeraReserva.valorOriginal * cabanas.length : null,
        valorDolarDia: primeraReserva.valorDolarDia || null
      };

      res.status(200).json({ info: infoGeneral, cabanas: cabanas });

    } catch (error) {
      console.error("Error al obtener detalles de la reserva:", error);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  return router;
};