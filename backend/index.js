require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- Inicialización de Firebase ---
// Parsea la clave de la cuenta de servicio desde la variable de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors()); // Permite peticiones desde cualquier origen (tu frontend)
app.use(express.json()); // Permite al servidor entender JSON

// --- Rutas ---
app.get('/', (req, res) => {
  res.status(200).send('API del Gestor de Reservas funcionando correctamente. ¡Hola Mundo!');
});

// Aquí agregaremos las rutas para cada funcionalidad (reservas, dashboard, etc.)
// Ejemplo: const reservasRoutes = require('./routes/reservas');
// app.use('/api', reservasRoutes(db));

// --- Iniciar Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});