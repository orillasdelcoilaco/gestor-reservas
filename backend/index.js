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
const bookingReconciliationRoutes = require('./routes/bookingReconciliationRoutes');
const tinajasRoutes = require('./routes/tinajasRoutes');
const aiRoutes = require('./routes/aiRoutes'); // [NEW] AI Routes

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
app.use(express.json({ limit: '10mb' }));

// --- 1. SERVIR ARCHIVOS ESTÁTICOS DEL FRONTEND ---
app.use(express.static(path.join(__dirname, 'frontend')));

//--- 2. DEFINIR Y APLICAR RUTAS DE LA API ---
const publicRouter = express.Router();
const privateRouter = express.Router();

//--- Configuración de Rutas Públicas (API) ---
publicRouter.use('/auth', authRoutes(db));
publicRouter.use(icalRoutes(db));
// publicRouter.use('/ai', aiRoutes); // Opcional: si quisieras que fuera pública sin auth.
// Por ahora la pondremos como pública para probar fácil o protegida según decidas. 
// El plan decía /api/ai, así que lo pondré en privateRouter si requiere auth, o publicRouter si no.
// Usualmente quieres proteger esto por costos. Lo pondré en privateRouter para requerir token,
// O en un bloque separado bajo /api si quiero ser flexible.
// Siguiendo el patrón existente:

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
const meRoutes = require('./routes/meRoutes');
privateRouter.use('/me', meRoutes(db));
privateRouter.use('/reconciliacion', bookingReconciliationRoutes(db));
privateRouter.use('/tinajas', tinajasRoutes(db));
privateRouter.use('/ai', aiRoutes); // [NEW] AI Endpoints (Protected)

// --- Módulo Vehicle Docs ---
// IMPORTANTE: El router vehicleDocs maneja su propia autenticación internamente
// El endpoint /test-image-processing NO requiere auth, los demás sí
const vehicleDocsRoutes = require('./routes/vehicleDocs');
app.use('/api/vehicle-docs', vehicleDocsRoutes);

const feedbackRoutes = require('./routes/feedback');
app.use('/api/feedback', checkFirebaseToken, feedbackRoutes);


// --- Módulo Vehicle Docs (Legacy/Optional - keep if needed or remove if migrating fully) ---
// const vehicleDocsApp = require('../apps/vehicle-docs/server')(db, checkFirebaseToken, admin);
// app.use('/vehiculos', vehicleDocsApp);

//--- Aplicación de los Routers a la App ---
app.use(publicRouter);
app.use('/api', checkFirebaseToken, privateRouter);

// --- SERVIR APLICACIÓN DE VEHÍCULOS ---
// Servir archivos estáticos de la app de vehículos
app.use('/vehiculos/app', express.static(path.join(__dirname, '../apps/vehicle-docs/web/dist')));

// Ruta específica para la app de vehículos (SPA routing)
app.get('/vehiculos/app/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../apps/vehicle-docs/web/dist', 'index.html'));
});

// --- RUTA ESPECÍFICA PARA TEST DE IMAGEN (Antes del catch-all) ---
app.get('/test-image.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-image.html'));
});

// --- 3. CATCH-ALL PARA MANEJAR RUTAS DEL FRONTEND (LOGIN) ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

//--- Iniciar el Servidor ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor iniciado y escuchando en el puerto ${PORT}`);
});
