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
const serviceAccount = process.env.RENDER 
    ? require('/etc/secrets/serviceAccountKey.json')
    : require('./serviceAccountKey.json');

const BUCKET_NAME = 'reservas-sodc.appspot.com'; // <-- Nombre del bucket definido una sola vez

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: BUCKET_NAME, 
    projectId: 'reservas-sodc' 
});

console.log(process.env.RENDER ? "Firebase Admin SDK inicializado desde Secret File (Producción)." : "Firebase Admin SDK inicializado desde archivo local (Desarrollo).");

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
// Pasamos el nombre del bucket a la ruta de gestión
privateRouter.use(gestionRoutes(db, BUCKET_NAME)); 

//--- Aplicación de los Routers a la App ---
app.use(publicRouter); 
app.use('/api', checkFirebaseToken, privateRouter); 

//--- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});