const BookingReconciliationService = require('../services/bookingReconciliationService');
const multer = require('multer');

// Configuración de Multer para almacenamiento en memoria
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limite
}).single('file'); // 'file' es el nombre del campo en el form data

const analyzeReport = async (req, res, db) => {
    // Envolver multer en una promesa para usarlo dentro de la función async
    upload(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: 'Error en subida de archivo: ' + err.message });
        } else if (err) {
            return res.status(500).json({ error: 'Error desconocido en subida: ' + err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
        }

        try {
            const service = new BookingReconciliationService(db);
            const result = await service.processReconciliation(req.file.buffer, {
                mimetype: req.file.mimetype,
                filename: req.file.originalname
            });

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Error en analyzeReport:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
};

const getHistory = async (req, res, db) => {
    try {
        const service = new BookingReconciliationService(db);
        const history = await service.getHistory();
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getReportDetail = async (req, res, db) => {
    try {
        const service = new BookingReconciliationService(db);
        const report = await service.getReportById(req.params.id);
        if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteReport = async (req, res, db) => {
    try {
        const service = new BookingReconciliationService(db);
        await service.deleteReport(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    analyzeReport,
    getHistory,
    getReportDetail,
    deleteReport
};
