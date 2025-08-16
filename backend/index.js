// Carga las variables de entorno del archivo .env
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- 1. IMPORTAR EL NUEVO ARCHIVO DE RUTAS ---
const reservasRoutes = require('./routes/reservas');

// --- Inicialización de Firebase Admin SDK ---
let serviceAccount;
try {
    // Parsea la clave de la cuenta de servicio desde la variable de entorno
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
    console.error('Error al parsear FIREBASE_SERVICE_ACCOUNT. Asegúrate de que esté bien configurada en el archivo .env o en las variables de entorno de Render.', e);
    process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares (configuraciones) ---
app.use(cors());
app.use(express.json());

// --- Rutas (endpoints) ---
app.get('/', (req, res) => {
  res.status(200).send('API del Gestor de Reservas funcionando correctamente.');
});

// --- 2. USAR LA NUEVA RUTA ---
// Cualquier petición a /api/... será manejada por el archivo reservasRoutes
app.use('/api', reservasRoutes(db));


// --- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
