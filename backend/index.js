const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const cookieParser = require('cookie-parser');

//--- Importar Middlewares y Rutas ---
const { checkSessionCookie } = require('./utils/authMiddleware');
const authRoutes = require('./routes/auth');
const reservasRoutes = require('./routes/reservas');
const sincronizarRoutes = require('./routes/sincronizar');
const consolidarRoutes = require('./routes/consolidar');
const dolarRoutes = require('./routes/dolar');
const mensajesRoutes = require('./routes/mensajes');
const contactosRoutes = require('./routes/contactos');
const clientesRoutes = require('./routes/clientes');

//--- Configuración de CORS ---
const corsOptions = {
  origin: 'https://www.orillasdelcoilaco.cl',
  optionsSuccessStatus: 200,
  credentials: true 
};

//--- Inicialización de Firebase Admin SDK ---
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

//--- Middlewares Globales ---
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

//--- Rutas ---

// Rutas Públicas (no requieren sesión)
app.get('/', (req, res) => {
  res.status(200).send('API del Gestor de Reservas funcionando correctamente.');
});
app.use('/api', authRoutes(db));

// Rutas Protegidas (requieren una cookie de sesión válida)
// Añadimos el middleware checkSessionCookie como un "guardia" antes de cada grupo de rutas.
app.use('/api', checkSessionCookie, reservasRoutes(db));
app.use('/api', checkSessionCookie, sincronizarRoutes(db));
app.use('/api', checkSessionCookie, consolidarRoutes(db));
app.use('/api', checkSessionCookie, dolarRoutes(db));
app.use('/api/mensajes', checkSessionCookie, mensajesRoutes(db));
app.use('/api/contactos', checkSessionCookie, contactosRoutes(db));
app.use('/api', checkSessionCookie, clientesRoutes(db));

//--- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});