const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- Importar archivos de rutas ---
const reservasRoutes = require('./routes/reservas');

// --- Inicialización de Firebase Admin SDK (Método Robusto) ---
if (process.env.RENDER) {
  // En producción (Render)
  const serviceAccount = require('/etc/secrets/serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin SDK inicializado en modo Producción (Render).");
} else {
  // En desarrollo (local)
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin SDK inicializado en modo Desarrollo (Local).");
}

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Rutas ---
app.get('/', (req, res) => {
  res.status(200).send('API del Gestor de Reservas funcionando correctamente.');
});

// --- RUTA DE DIAGNÓSTICO ---
// Esta nueva ruta nos dirá qué colecciones está viendo la API.
app.get('/api/diagnostico', async (req, res) => {
    try {
        console.log("Ejecutando diagnóstico de colecciones...");
        const collections = await db.listCollections();
        const collectionIds = collections.map(col => col.id);
        console.log("Colecciones encontradas:", collectionIds);
        res.status(200).json({
            mensaje: "Diagnóstico completado.",
            coleccionesEncontradas: collectionIds
        });
    } catch (error) {
        console.error("Error en el diagnóstico:", error);
        res.status(500).json({ error: "Error al listar colecciones." });
    }
});

app.use('/api', reservasRoutes(db));

// --- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
