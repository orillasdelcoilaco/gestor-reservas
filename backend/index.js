const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- Importar archivos de rutas ---
const reservasRoutes = require('./routes/reservas');

// --- Inicialización de Firebase Admin SDK (Método Robusto) ---
// Render crea una variable de entorno 'RENDER' automáticamente.
if (process.env.RENDER) {
  // Estamos en producción (Render)
  // Render crea un archivo secreto en esta ruta a partir de lo que subamos.
  const serviceAccount = require('/etc/secrets/serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin SDK inicializado en modo Producción (Render).");
} else {
  // Estamos en desarrollo (local)
  // Carga el archivo local que creaste en el Paso 1.
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

app.use('/api', reservasRoutes(db));

// --- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
