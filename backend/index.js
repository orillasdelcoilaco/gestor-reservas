// backend/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');

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
const planificadorRoutes = require('./routes/planificador');
const settingsRoutes = require('./routes/settingsRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const incidentsRoutes = require('./routes/incidentsRoutes');
const historyRoutes = require('./routes/historyRoutes');
const reportRoutes = require('./routes/reportRoutes');
const taskRoutes = require('./routes/taskRoutes');
const { initTelegramBot } = require('./services/notificationService');

// Lista de dominios permitidos
const allowedOrigins = [
  'https://orillasdelcoilaco.cl',
  'https://www.orillasdelcoilaco.cl',
  'https://gestor-reservas.onrender.com', // <-- SE AÑADE LA URL DE RENDER
  // Añadido para desarrollo local
  'http://localhost',
  'http://127.0.0.1'
];

const corsOptions = {
  origin: function (origin, callback) {
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
// Init Telegram Bot Listener
initTelegramBot(db).catch(err => console.error('Failed to init Telegram Bot:', err));

const app = express();
const PORT = process.env.PORT || 4001;

//--- Middlewares Globales ---
app.use(cors(corsOptions));
app.use(express.json());

// --- 1. SERVIR ARCHIVOS ESTÁTICOS DEL FRONTEND ---
app.use(express.static(path.join(__dirname, 'frontend')));

//--- 2. DEFINIR Y APLICAR RUTAS DE LA API ---
const publicRouter = express.Router();
const privateRouter = express.Router();

//--- Configuración de Rutas Públicas (API) ---
publicRouter.use('/auth', authRoutes(db));
publicRouter.use(icalRoutes(db));

//--- Configuración de Rutas Privadas (API) ---
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
privateRouter.use(planificadorRoutes(db));
privateRouter.use(settingsRoutes(db));
privateRouter.use(dashboardRoutes(db));
privateRouter.use(incidentsRoutes(db));
privateRouter.use(historyRoutes(db));
privateRouter.use(reportRoutes(db));
privateRouter.use('/task-types', taskRoutes(db));

//--- Aplicación de los Routers a la App ---
app.use(publicRouter);
app.use('/api', checkFirebaseToken, privateRouter);

// --- 3. CATCH-ALL PARA MANEJAR RUTAS DEL FRONTEND ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

//--- Iniciar el Servidor ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor iniciado y escuchando en el puerto ${PORT}`);
});
