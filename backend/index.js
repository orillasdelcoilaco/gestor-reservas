const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

//--- Importar archivos de rutas ---
const reservasRoutes = require('./routes/reservas');
const sincronizarRoutes = require('./routes/sincronizar');
const consolidarRoutes = require('./routes/consolidar');
const dolarRoutes = require('./routes/dolar');
const mensajesRoutes = require('./routes/mensajes');
// const contactosRoutes = require('./routes/contactos'); // <-- LÍNEA ELIMINADA

//--- Configuración de CORS ---
const corsOptions = {
  origin: 'https://www.orillasdelcoilaco.cl',
  optionsSuccessStatus: 200
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

//--- Middlewares
app.use(cors(corsOptions));
app.use(express.json());

//--- Rutas ---
app.get('/', (req, res) => {
  res.status(200).send('API del Gestor de Reservas funcionando correctamente.');
});

app.use('/api', reservasRoutes(db));
app.use('/api', sincronizarRoutes(db));
app.use('/api', consolidarRoutes(db));
app.use('/api', dolarRoutes(db));
app.use('/api/mensajes', mensajesRoutes(db));
// app.use('/api/contactos', contactosRoutes(db)); // <-- LÍNEA ELIMINADA

//--- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});