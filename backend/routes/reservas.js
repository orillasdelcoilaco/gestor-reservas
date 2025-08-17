// backend/routes/reservas.js

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

router.get('/', async (req, res) => {
  try {
    const reservasSnapshot = await db.collection('reservas')
      .orderBy('fecha_checkin', 'desc') // <--- CORRECCIÓN: Ordenar por fecha
      .get();

    if (reservasSnapshot.empty) {
      return res.status(404).json({ message: "No se encontraron reservas." });
    }

    const reservas = [];
    reservasSnapshot.forEach(doc => {
      const data = doc.data();
      reservas.push({
        id: doc.id,
        // Asegúrate de convertir las fechas a un formato legible si es necesario
        fecha_checkin: data.fecha_checkin.toDate().toLocaleDateString('es-CL'),
        fecha_checkout: data.fecha_checkout.toDate().toLocaleDateString('es-CL'),
        nombre_cliente: data.nombre_cliente, // <--- Dato que ya viene del consolidationService
        telefono_cliente: data.telefono_cliente,
        alojamiento: data.alojamiento, // <--- Dato que ya viene del consolidationService
        origen: data.origen,
      });
    });

    res.status(200).json(reservas);

  } catch (error) {
    console.error("Error al obtener las reservas:", error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
});

module.exports = router;