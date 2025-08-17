const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- Importar archivos de rutas ---
const reservasRoutes = require('./routes/reservas');
const sincronizarRoutes = require('./routes/sincronizar');
const consolidarRoutes = require('./routes/consolidar'); // <-- AÑADIDO
const dolarRoutes = require('./routes/dolar'); // <-- AÑADIR ESTA LÍNEA

// --- Inicialización de Firebase Admin SDK ---
if (process.env.RENDER) {
  const serviceAccount = require('/etc/secrets/serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin SDK inicializado en modo Producción (Render).");
} else {
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
// --- Middlewares ---
const corsOptions = {
  origin: 'https://www.orillasdelcoilaco.cl',
  optionsSuccessStatus: 200 // Para navegadores antiguos
};
app.use(cors(corsOptions));
app.use(express.json());

// --- Rutas ---
app.get('/', (req, res) => {
  res.status(200).send('API del Gestor de Reservas funcionando correctamente.');
});

app.use('/api', reservasRoutes(db));
app.use('/api', sincronizarRoutes(db));
app.use('/api', consolidarRoutes(db)); // <-- AÑADIDO
app.use('/api', dolarRoutes(db)); // <-- AÑADIR ESTA LÍNEA

// --- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
