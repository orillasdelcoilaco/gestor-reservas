const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const path = require('path');
const { getReservasPendientes } = require('../services/gestionService');
const storageService = require('../services/storageService');

const jsonParser = express.json();
const upload = require('multer')({ storage: require('multer').memoryStorage() });

module.exports = (db) => {

    // ... (Todas las rutas existentes hasta el final del archivo permanecen igual) ...

    router.post('/gestion/fix-missing-states', async (req, res) => {
        // ... (Esta ruta no cambia) ...
    });

    // --- INICIO DE LA NUEVA RUTA DE REPARACIÓN DE TELÉFONOS ---
    router.post('/gestion/fix-missing-phones', async (req, res) => {
        try {
            console.log('Iniciando proceso para reparar teléfonos faltantes en reservas...');
            const snapshot = await db.collection('reservas').get();
            if (snapshot.empty) {
                return res.status(200).json({ message: 'No hay reservas para verificar.', repairedCount: 0 });
            }

            const clientsCache = new Map();
            const batch = db.batch();
            let repairedCount = 0;
            
            // Usamos un bucle for...of para poder usar await dentro
            for (const doc of snapshot.docs) {
                const data = doc.data();
                
                // Si la reserva no tiene teléfono pero sí tiene un cliente asociado
                if ((!data.hasOwnProperty('telefono') || !data.telefono) && data.clienteId) {
                    let clientPhone = clientsCache.get(data.clienteId);

                    // Si no tenemos el teléfono del cliente en caché, lo buscamos
                    if (!clientPhone) {
                        const clientDoc = await db.collection('clientes').doc(data.clienteId).get();
                        if (clientDoc.exists() && clientDoc.data().phone) {
                            clientPhone = clientDoc.data().phone;
                            clientsCache.set(data.clienteId, clientPhone); // Guardamos en caché para no volver a buscar
                        }
                    }

                    // Si encontramos un teléfono, preparamos la actualización
                    if (clientPhone) {
                        const reservaRef = db.collection('reservas').doc(doc.id);
                        batch.update(reservaRef, { telefono: clientPhone });
                        repairedCount++;
                    }
                }
            }

            if (repairedCount > 0) {
                await batch.commit();
                console.log(`Proceso completado. Se repararon ${repairedCount} reservas.`);
                return res.status(200).json({ message: `Proceso completado. Se añadieron los números de teléfono a ${repairedCount} reservas.` });
            } else {
                console.log('No se encontraron reservas que necesitaran reparación de teléfono.');
                return res.status(200).json({ message: 'No se encontraron reservas con teléfonos faltantes. Todo parece estar en orden.' });
            }

        } catch (error) {
            console.error("Error al reparar teléfonos de reservas:", error);
            res.status(500).json({ error: 'Error interno del servidor al reparar los teléfonos.' });
        }
    });
    // --- FIN DE LA NUEVA RUTA ---
    
    return router;
};