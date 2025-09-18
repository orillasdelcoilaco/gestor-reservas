// backend/index.js
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path'); // <-- Se añade el módulo 'path'

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
const cabanasRoutes = require('./routes/cabanas');
const presupuestosRoutes = require('./routes/presupuestos');
const icalRoutes = require('./routes/ical');
const calendarioRoutes = require('./routes/calendario');
const reportesRoutes = require('./routes/reportes');

// Lista de dominios permitidos
const allowedOrigins = [
    'https://orillasdelcoilaco.cl',
    'https://www.orillasdelcoilaco.cl',
    // Añadido para desarrollo local
    'http://localhost',
    'http://127.0.0.1'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permite solicitudes sin 'origin' (como Postman) o si el origen está en la lista blanca.
    // Se ajusta para permitir cualquier puerto de localhost.
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  optionsSuccessStatus: 200
};

//--- Inicialización de Firebase Admin SDK ---
const serviceAccount = process.env.RENDER 
    ? require('/etc/secrets/serviceAccountKey.json')
    : require('./serviceAccountKey.json');

const BUCKET_NAME = 'reservas-sodc.firebasestorage.app'; 

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
publicRouter.use(icalRoutes(db));
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
privateRouter.use(cabanasRoutes(db));
privateRouter.use(presupuestosRoutes(db));
privateRouter.use(calendarioRoutes(db));
privateRouter.use(reportesRoutes(db));

//--- Aplicación de los Routers a la App ---
app.use(publicRouter); 
app.use('/api', checkFirebaseToken, privateRouter); 

// --- SERVIR ARCHIVOS ESTÁTICOS DEL FRONTEND ---
app.use(express.static(path.join(__dirname, 'frontend')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});


//--- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});