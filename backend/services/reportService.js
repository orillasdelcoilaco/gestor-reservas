// backend/services/reportService.js
const PDFDocument = require('pdfkit');
const historyService = require('./historyService');
const notificationService = require('./notificationService');
const { getSettings } = require('./settingsService');
const admin = require('firebase-admin');

/**
 * Genera un reporte PDF basado en filtros.
 * @param {Object} db - Firestore DB
 * @param {Object} filters - Filtros de fecha/cabaña
 * @param {Object} res - Express Response object (stream)
 * @param {Array} [injectedEvents] - Optional mock events
 */
async function generateDailyReport(db, filters, res, injectedEvents = null) {
    // 1. Obtener Datos
    const events = injectedEvents || await historyService.getHistory(db, filters);
    const settings = await getSettings(db);

    // 2. Calcular Métricas
    let totalEsfuerzo = 0;
    let totalIncidencias = 0;
    let totalLimpiezas = 0;
    const incidentsBySpace = {};

    events.forEach(ev => {
        if (ev.type === 'TAREA') {
            if (ev.subType === 'FINALIZADO' || true) { // History returns completed tasks
                // Metadata peso might be undefined if not saved. defaulting to 1?
                // Task types: Cambio (~2.5?), Salida (3.0?), Limpieza (1.0).
                // Use metadata.peso if avail.
                const peso = ev.metadata?.peso || 0;
                totalEsfuerzo += peso;
                totalLimpiezas++;
            }
        } else if (ev.type === 'INCIDENCIA') {
            totalIncidencias++;
            const key = `${ev.cabanaId} - ${ev.espacio}`;
            if (!incidentsBySpace[key]) incidentsBySpace[key] = 0;
            incidentsBySpace[key]++;
        }
    });

    // 3. Generar PDF
    const doc = new PDFDocument({ margin: 50 });

    // Pipe to response
    doc.pipe(res);

    // Header
    doc.fontSize(20).text(settings.nombreEmpresa || 'Zacatines', { align: 'center' });
    doc.fontSize(12).text('Reporte de Salud de Cabañas (Cabin Health)', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generado: ${new Date().toLocaleString('es-CL')}`, { align: 'right' });
    doc.moveDown();

    // Filtros aplicados
    doc.text(`Periodo: ${filters.startDate || 'Inicio'} a ${filters.endDate || 'Fin'}`);
    if (filters.cabanaId) doc.text(`Cabaña: ${filters.cabanaId}`);
    doc.moveDown();

    // Métricas Clave (Cards simulados)
    const startY = doc.y;
    doc.rect(50, startY, 150, 60).stroke();
    doc.text('Esfuerzo Total', 60, startY + 10);
    doc.fontSize(18).text(totalEsfuerzo.toFixed(1), 60, startY + 30);

    doc.fontSize(10);
    doc.rect(220, startY, 150, 60).stroke();
    doc.text('Limpiezas Realizadas', 230, startY + 10);
    doc.fontSize(18).text(totalLimpiezas, 230, startY + 30);

    doc.fontSize(10);
    doc.rect(390, startY, 150, 60).stroke();
    doc.text('Incidencias Reportadas', 400, startY + 10);
    doc.fontSize(18).text(totalIncidencias, 400, startY + 30);

    doc.fontSize(10);
    doc.moveDown(5);

    // Resumen de Incidencias
    doc.fontSize(14).text('Resumen de Incidencias por Espacio', { underline: true });
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10);

    let i = 0;
    for (const [key, count] of Object.entries(incidentsBySpace)) {
        const y = tableTop + (i * 20);
        if (y > 700) {
            doc.addPage();
            // Reset y if needed
        }
        doc.text(key, 50, y);
        doc.text(count.toString(), 400, y);
        i++;
    }

    if (Object.keys(incidentsBySpace).length === 0) {
        doc.text('Sin incidencias reportadas en este periodo.', 50, tableTop);
    }

    // Pie de Página
    const bottom = doc.page.height - 50;
    doc.fontSize(8).text(`Administrador: ${settings.adminNombre || 'Firma'}`, 50, bottom);
    doc.text('Documento generado automáticamente por Sistema Zacatines', 50, bottom + 15);

    doc.end();
}

/**
 * Genera el reporte en memoria y lo envía por Telegram.
 */
async function generateAndSendReport(db, filters) {
    return new Promise(async (resolve, reject) => {
        try {
            const events = await historyService.getHistory(db, filters);
            const settings = await getSettings(db);

            // Same logic? or reuse?
            // Should refactor logic to 'generateDoc' and reuse. But for speed, let's just copy logic or refactor.
            // To avoid huge refactor, I will just replicate the doc creation structure quickly or refactor 'generateDailyReport' to NOT require 'res' but accept any stream.
            // Actually `generateDailyReport` accepts 'res' which is a stream. I can pass a PassThrough stream.
            // But PDFKit creates a stream. 'doc' IS a stream.

            // Let's refactor slightly to separate "Create Document" from "Pipe to Res".

            // --- REFACTOR --- (Actually I'll just implementing a buffer collector here)
            // But I need the metrics logic.
            // Let's modify generateDailyReport to optional return the metrics or doc?
            // Easier: Implement a helper 'createReportDoc(db, filters)' that returns the PDFDocument instance.

            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', async () => {
                const pdfData = Buffer.concat(buffers);
                const result = await notificationService.sendReportPdf(db, pdfData, 'Reporte_Mensual.pdf');
                resolve(result);
            });

            // Re-implement metrics logic... to avoid code duplication, I SHOULD refactor.
            // But user is waiting. I will call generateDailyReport with a mock stream?
            // No, generateDailyReport pipes.

            // I will overwrite generateDailyReport in reportService.js to separate logic.
            // BUT I only have replace_file_content.
            // I will just implement the method fully here with reused logic to ensure stability.

            // 2. Calcular Métricas
            let totalEsfuerzo = 0;
            let totalIncidencias = 0;
            let totalLimpiezas = 0;
            const incidentsBySpace = {};

            events.forEach(ev => {
                if (ev.type === 'TAREA') {
                    if (ev.subType === 'FINALIZADO' || true) {
                        const peso = ev.metadata?.peso || 0;
                        totalEsfuerzo += peso;
                        totalLimpiezas++;
                    }
                } else if (ev.type === 'INCIDENCIA') {
                    totalIncidencias++;
                    const key = `${ev.cabanaId} - ${ev.espacio}`;
                    if (!incidentsBySpace[key]) incidentsBySpace[key] = 0;
                    incidentsBySpace[key]++;
                }
            });

            // Build PDF
            doc.fontSize(20).text(settings.nombreEmpresa || 'Zacatines', { align: 'center' });
            doc.fontSize(12).text('Reporte de Salud de Cabañas (Mensual)', { align: 'center' });
            doc.moveDown();
            doc.text(`Periodo: ${filters.startDate || 'Inicio'} a ${filters.endDate || 'Fin'}`);
            // ... (Simplified for Telegram version or Full?) Full.
            // ... (Same Key Metrics logic)
            // KPI Cards textual
            doc.moveDown();
            doc.fontSize(10);
            doc.text(`Esfuerzo Total: ${totalEsfuerzo.toFixed(1)}`);
            doc.text(`Limpiezas: ${totalLimpiezas}`);
            doc.text(`Incidencias: ${totalIncidencias}`);
            doc.moveDown();

            doc.fontSize(14).text('Resumen de Incidencias por Espacio', { underline: true });
            doc.moveDown();
            doc.fontSize(10);
            for (const [key, count] of Object.entries(incidentsBySpace)) {
                doc.text(`${key}: ${count}`);
            }
            doc.end();

        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Busca choques de reservas desde una fecha dada.
 * @param {Object} db - Firestore
 * @param {string} startDateStr - 'YYYY-MM-DD'
 */
/**
 * Busca choques de reservas y discrepancias de estado.
 * @param {Object} db - Firestore
 * @param {string} startDateStr - 'YYYY-MM-DD'
 */
async function findReservationOverlaps(db, startDateStr) {
    const start = new Date(startDateStr || new Date().toISOString().split('T')[0]);
    // Get ALL active reservations from now on.
    const snapshot = await db.collection('reservas')
        .where('fechaSalida', '>=', admin.firestore.Timestamp.fromDate(start))
        .get();

    const reservas = [];
    const mismatches = []; // Discrepancias de estado

    snapshot.forEach(doc => {
        const d = doc.data();

        // 1. Detección de Mismatch (Estado Interno vs Estado Reporte)
        // Ignoramos si estadoReporte no existe (reservas antiguas manuales)
        if (d.estadoReporte && d.estado && d.estado.toUpperCase() !== d.estadoReporte.toUpperCase()) {
            // Excepción: Si interno es 'Confirmada' y reporte es 'OK' (son lo mismo)
            const interno = d.estado.toUpperCase();
            const reporte = d.estadoReporte.toUpperCase();

            // Mapeo simple de equivalencias
            const isEquivalent = (interno === 'CONFIRMADA' && reporte === 'OK') ||
                (interno === 'CANCELADA' && (reporte === 'CANCELLED' || reporte === 'CANCELADA'));

            if (!isEquivalent) {
                mismatches.push({
                    id: d.reservaIdOriginal || doc.id,
                    cliente: d.clienteNombre || 'Desconocido',
                    canal: d.canal,
                    estadoInterno: d.estado,
                    estadoReporte: d.estadoReporte,
                    cabana: d.alojamiento
                });
            }
        }

        // 2. Filtro para Overlaps: Solo Confirmadas
        if (d.estado && d.estado.trim() === 'Confirmada') {
            // Fallback for Cabin Name if missing
            let cabanaName = d.alojamiento;
            if (!cabanaName && (d.reservaId || doc.id).includes('_')) {
                const parts = (d.reservaId || doc.id).split('_');
                cabanaName = parts[parts.length - 1]; // Assuming format ..._Cabaña1
            }

            // CLEANING LOGIC (1,2,3,7,8,9,10)
            if (cabanaName) {
                const match = cabanaName.match(/(\d+)/);
                if (match) {
                    let num = parseInt(match[1]);
                    // User Rule: 1,2,3,7,8,9,10 are valid.
                    // If > 10, clean it. (e.g. 71 -> 7, 81 -> 8).
                    if (num !== 10 && num > 9) {
                        num = parseInt(match[1].toString()[0]);
                    }
                    cabanaName = `Cabaña ${num}`;
                }
            }

            reservas.push({
                id: d.reservaId || doc.id,
                cabana: cabanaName || '??',
                cliente: d.clienteNombre || d.cliente || 'Desconocido',
                desde: d.fechaLlegada.toDate(),
                hasta: d.fechaSalida.toDate(),
                canal: d.canal || 'Directo',
                personas: d.invitados || d.personas || 0,
                telefono: d.telefono || 'Sin datos',
                creada: d.fechaReserva ? d.fechaReserva.toDate() : (d.fechaCreacion ? d.fechaCreacion.toDate() : null), // Prefer fechaReserva for Booking
                codigo: d.reservaIdOriginal || d.reservaId || doc.id,
                abono: d.abono || 0 // New field
            });
        }
    });

    // Group by Cabin
    const byCabana = {};
    reservas.forEach(r => {
        if (!byCabana[r.cabana]) byCabana[r.cabana] = [];
        byCabana[r.cabana].push(r);
    });

    const conflicts = [];

    // Check overlaps
    for (const [cab, list] of Object.entries(byCabana)) {
        // Sort by start date
        list.sort((a, b) => a.desde - b.desde);

        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const r1 = list[i];
                const r2 = list[j];

                if (r1.hasta > r2.desde) {
                    // CONFLICT FOUND
                    conflicts.push({
                        type: 'OVERLAP',
                        cabana: cab,
                        reservaA: r1,
                        reservaB: r2,
                        diasChoque: `${r2.desde.toISOString().split('T')[0]} a ${r1.hasta < r2.hasta ? r1.hasta.toISOString().split('T')[0] : r2.hasta.toISOString().split('T')[0]}`
                    });
                }
            }
        }
    }

    // Combine conflicts and mismatches
    // We return a mixed array, frontend will handle types
    mismatches.forEach(m => {
        conflicts.push({
            type: 'MISMATCH',
            ...m
        });
    });

    return conflicts;
}

module.exports = {
    generateDailyReport,
    generateAndSendReport,
    findReservationOverlaps
};
