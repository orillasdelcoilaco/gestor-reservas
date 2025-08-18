const express = require('express');
const router = express.Router();

module.exports = (db) => {
  // --- OBTENER TODAS LAS RESERVAS (GET) ---
  router.get('/reservas', async (req, res) => {
    try {
      const snapshot = await db.collection('reservas').orderBy('fechaLlegada', 'desc').get();
      if (snapshot.empty) return res.status(200).json([]);

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
          telefono: data.clienteId || 'N/A',
          llegada: llegada,
          salida: salida,
          estado: data.estado || 'N/A',
          alojamiento: data.alojamiento || 'N/A',
          valorCLP: data.valorCLP || 0,
          totalNoches: data.totalNoches || 0,
          valorManual: data.valorManual || false // <-- Enviamos la bandera al frontend
        });
      });
      res.status(200).json(todasLasReservas);
    } catch (error) {
      console.error("Error al obtener las reservas consolidadas:", error);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // --- ACTUALIZAR UNA RESERVA INDIVIDUAL (PUT) ---
  router.put('/reservas/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { valorCLP } = req.body;
      if (valorCLP === undefined || typeof valorCLP !== 'number') {
        return res.status(400).json({ error: 'El campo valorCLP es requerido y debe ser un número.' });
      }
      
      const reservaRef = db.collection('reservas').doc(id);
      const doc = await reservaRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'La reserva no existe.' });
      }
      const valorActual = doc.data().valorCLP;

      await reservaRef.update({ 
        valorCLP: valorCLP,
        valorOriginalCLP: valorActual, // Guardamos el valor original
        valorManual: true // Activamos el "candado"
      });
      res.status(200).json({ message: 'Reserva actualizada correctamente.' });
    } catch (error) {
      console.error("Error al actualizar la reserva:", error);
      res.status(500).json({ error: 'Error interno del servidor al actualizar la reserva.' });
    }
  });

  // --- ACTUALIZAR UN GRUPO DE RESERVAS (PUT) ---
  router.put('/reservas/grupo/:reservaIdOriginal', async (req, res) => {
    try {
        const { reservaIdOriginal } = req.params;
        const { nuevoTotalCLP } = req.body;
        if (nuevoTotalCLP === undefined || typeof nuevoTotalCLP !== 'number') {
            return res.status(400).json({ error: 'El campo nuevoTotalCLP es requerido y debe ser un número.' });
        }

        const query = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
        const snapshot = await query.get();
        if (snapshot.empty) {
            return res.status(404).json({ error: 'No se encontraron reservas para el ID de grupo proporcionado.' });
        }

        let totalActualCLP = 0;
        const reservasDelGrupo = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            totalActualCLP += data.valorCLP;
            reservasDelGrupo.push({ id: doc.id, valorCLP: data.valorCLP });
        });

        const batch = db.batch();
        reservasDelGrupo.forEach(reserva => {
            const docRef = db.collection('reservas').doc(reserva.id);
            let nuevoValorIndividual;
            if (totalActualCLP === 0) {
                nuevoValorIndividual = Math.round(nuevoTotalCLP / reservasDelGrupo.length);
            } else {
                const proporcion = reserva.valorCLP / totalActualCLP;
                nuevoValorIndividual = Math.round(nuevoTotalCLP * proporcion);
            }
            batch.update(docRef, { 
                valorCLP: nuevoValorIndividual,
                valorOriginalCLP: reserva.valorCLP, // Guardamos el valor original de cada una
                valorManual: true // Activamos el "candado"
            });
        });

        await batch.commit();
        res.status(200).json({ message: `Grupo de reserva ${reservaIdOriginal} actualizado correctamente.` });
    } catch (error) {
        console.error("Error al actualizar el grupo de reservas:", error);
        res.status(500).json({ error: 'Error interno del servidor al actualizar el grupo de reservas.' });
    }
  });

  return router;
};
