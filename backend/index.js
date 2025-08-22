const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- Importar Middlewares y Rutas ---
const { checkFirebaseToken } = require('./utils/authMiddleware'); // <-- Cambiamos al nuevo guardia
const reservasRoutes = require('./routes/reservas');
const sincronizarRoutes = require('./routes/sincronizar');
const consolidarRoutes = require('./routes/consolidar');
const dolarRoutes = require('./routes/dolar');
const mensajesRoutes = require('./routes/mensajes');
const clientesRoutes = require('./routes/clientes');

//--- Configuración de CORS ---
const corsOptions = {
  origin: 'https://www.orillasdelcoilaco.cl',
  optionsSuccessStatus: 200
};

//--- Inicialización de Firebase Admin SDK ---
if (process.env.RENDER) {
  const serviceAccount = require('/etc/secrets/serviceAccountKey.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log("Firebase Admin SDK inicializado en modo Producción (Render).");
} else {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log("Firebase Admin SDK inicializado en modo Desarrollo (Local).");
}
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3001;

//--- Middlewares
app.use(cors(corsOptions));
app.use(express.json());
// Ya no necesitamos cookieParser, así que se elimina.

//--- Rutas ---
app.get('/', (req, res) => {
  res.status(200).send('API del Gestor de Reservas funcionando correctamente.');
});

// Aplicamos el nuevo guardia "checkFirebaseToken" a todas las rutas que necesitan protección.
app.use('/api', checkFirebaseToken, reservasRoutes(db));
app.use('/api', checkFirebaseToken, sincronizarRoutes(db));
app.use('/api', checkFirebaseToken, consolidarRoutes(db));
app.use('/api', checkFirebaseToken, dolarRoutes(db));
app.use('/api/mensajes', checkFirebaseToken, mensajesRoutes(db));
app.use('/api', checkFirebaseToken, clientesRoutes(db));

//--- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});