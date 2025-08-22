const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const cookieParser = require('cookie-parser');

const { checkSessionCookie } = require('./utils/authMiddleware');
const authRoutes = require('./routes/auth');
const reservasRoutes = require('./routes/reservas');
const sincronizarRoutes = require('./routes/sincronizar');
const consolidarRoutes = require('./routes/consolidar');
const dolarRoutes = require('./routes/dolar');
const mensajesRoutes = require('./routes/mensajes');
const clientesRoutes = require('./routes/clientes');

// --- CONFIGURACIÓN CORS DEFINITIVA ---
// Hacemos que CORS acepte peticiones tanto desde 'www.orillas...' como 'orillas...'
const corsOptions = {
  origin: [
    'https://www.orillasdelcoilaco.cl',
    'https://orillasdelcoilaco.cl'
  ],
  optionsSuccessStatus: 200,
  credentials: true
};
// --- FIN DE LA CORRECCIÓN ---

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

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.status(200).send('API del Gestor de Reservas funcionando correctamente.');
});

app.use('/api', authRoutes(db));
app.use('/api', checkSessionCookie, reservasRoutes(db));
app.use('/api', checkSessionCookie, sincronizarRoutes(db));
app.use('/api', checkSessionCookie, consolidarRoutes(db));
app.use('/api', checkSessionCookie, dolarRoutes(db));
app.use('/api/mensajes', checkSessionCookie, mensajesRoutes(db));
app.use('/api', checkSessionCookie, clientesRoutes(db));

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});