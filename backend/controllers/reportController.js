// backend/controllers/reportController.js
const reportService = require('../services/reportService');

async function downloadReport(req, res, db) {
    try {
        const filters = {
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            cabanaId: req.query.cabanaId
        };

        // Configurar Headers para descarga
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte_zacatines.pdf');

        await reportService.generateDailyReport(db, filters, res);

    } catch (error) {
        console.error('Error generando reporte:', error);
        // Si ya se enviaron headers, no podemos enviar JSON.
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error generando PDF' });
        }
    }
}

async function sendReportToAdmin(req, res, db) {
    try {
        const filters = {
            startDate: req.query.startDate, // O default a mes actual
            endDate: req.query.endDate,
            cabanaId: req.query.cabanaId
        };

        await reportService.generateAndSendReport(db, filters);
        res.json({ success: true, message: 'Reporte enviado al Administrador por Telegram.' });
    } catch (error) {
        console.error('Error enviando reporte:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    downloadReport,
    sendReportToAdmin
};

async function getOverlaps(req, res, db) {
    try {
        const conflicts = await reportService.findReservationOverlaps(db);
        res.json(conflicts);
    } catch (error) {
        console.error('Error buscando choques:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    downloadReport,
    sendReportToAdmin,
    getOverlaps
};
