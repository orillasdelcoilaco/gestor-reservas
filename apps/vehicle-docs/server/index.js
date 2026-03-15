const express = require('express');
const path = require('path');
const cors = require('cors');

module.exports = (db, checkFirebaseToken, admin) => {
    const app = express();
    const bucket = admin.storage().bucket(); // Get bucket from admin instance

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Inject Dependencies to Routes
    const vehicleRoutes = require('./routes/vehicles')(db, bucket);
    const documentRoutes = require('./routes/documents')(db, bucket); // Pass bucket
    const extractRoutes = require('./routes/extract')(db);
    const householdRoutes = require('./routes/households')(db);

    // Frontend Static Serving (Production Build)
    const DIST_PATH = path.join(__dirname, '../web/dist');

    // Public App Routes (Static Files) - No Auth Required
    app.use('/app', express.static(DIST_PATH));

    // Catch-all for Frontend Routing (SPA support)
    app.get(/^\/app/, (req, res) => {
        res.sendFile(path.join(DIST_PATH, 'index.html'));
    });

    // secure API Routes
    // Mounted at /vehiculos/api/...
    // We apply the checkFirebaseToken middleware here to protect all API routes
    const apiRouter = express.Router();

    if (checkFirebaseToken) {
        apiRouter.use(checkFirebaseToken);
    } else {
        console.warn('WARNING: checkFirebaseToken middleware not provided to vehicle-docs');
    }

    apiRouter.use('/vehicles', vehicleRoutes);
    apiRouter.use('/households', require('./routes/households')(db));
    apiRouter.use('/documents', documentRoutes);
    apiRouter.use('/extract', extractRoutes);

    app.use('/api', apiRouter);

    app.get('/health', (req, res) => {
        res.json({ status: 'Vehicle Docs Module Online', timestamp: new Date() });
    });

    return app;
};
