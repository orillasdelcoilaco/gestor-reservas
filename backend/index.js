const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- Importar Middlewares y Rutas ---
const { checkFirebaseToken } = require('./utils/authMiddleware');
const authRoutes = require('./routes/authRoutes');
const reservasRoutes = require('./routes/reservas');
const sincronizarRoutes = require('./routes/sincronizar');
const consolidarRoutes = require('./routes/consolidar');
const dolarRoutes = require('./routes/dolar');
const mensajesRoutes = require('./routes/mensajes');
const clientesRoutes = require('./routes/clientes');
const importRoutes = require('./routes/import');
const tarifasRoutes = require('./routes/tarifas');
const kpiRoutes = require('./routes/kpi');
const analisisRoutes = require('./routes/analisis');
const gestionRoutes = require('./routes/gestion');

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

//--- Middlewares Globales ---
app.use(cors(corsOptions));

//--- Creación de Routers Separados ---
const publicRouter = express.Router();
const privateRouter = express.Router();

//--- Configuración de Rutas Públicas ---
publicRouter.use('/auth', authRoutes(db));
publicRouter.get('/', (req, res) => {
  res.status(200).send('API del Gestor de Reservas funcionando correctamente.');
});

//--- Configuración de Rutas Privadas ---
privateRouter.use(reservasRoutes(db));
privateRouter.use(sincronizarRoutes(db));
privateRouter.use(consolidarRoutes(db));
privateRouter.use(dolarRoutes(db));
privateRouter.use('/mensajes', mensajesRoutes(db));
privateRouter.use(clientesRoutes(db));
privateRouter.use(importRoutes(db));
privateRouter.use(tarifasRoutes(db));
privateRouter.use(kpiRoutes(db));
privateRouter.use(analisisRoutes(db));
privateRouter.use(gestionRoutes(db));

//--- Aplicación de los Routers a la App ---
app.use(publicRouter); // El router público se aplica SIN seguridad
app.use('/api', checkFirebaseToken, privateRouter); // El router privado se aplica CON el middleware de seguridad

//--- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});