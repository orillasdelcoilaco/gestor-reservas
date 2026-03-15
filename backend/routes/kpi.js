const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { calculateKPIs, getCabanaReservations } = require('../services/kpiService');

module.exports = (db) => {
    router.get('/kpi', async (req, res) => {
        const { fechaInicio, fechaFin } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ error: 'Se requieren las fechas de inicio y fin.' });
        }

        try {
            const { results, warningMessage } = await calculateKPIs(db, fechaInicio, fechaFin);
            res.status(200).json({ ...results, warning: warningMessage });
        } catch (error) {
            console.error("Error en la ruta de KPIs:", error);
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/kpi/cabana-detail', async (req, res) => {
        const { cabañaNombre, fechaInicio, fechaFin } = req.query;
        if (!cabañaNombre || !fechaInicio || !fechaFin) {
            return res.status(400).json({ error: 'Se requieren cabañaNombre, fechaInicio y fechaFin.' });
        }
        try {
            const reservas = await getCabanaReservations(db, cabañaNombre, fechaInicio, fechaFin);
            res.status(200).json({ reservas });
        } catch (error) {
            console.error("Error en detalle de cabaña:", error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/kpi/proyeccion-anual?anioProyeccion=2026&metaAnual=10000000
    router.get('/kpi/proyeccion-anual', async (req, res) => {
        const anioProyeccion = parseInt(req.query.anioProyeccion) || new Date().getFullYear();
        const metaAnual      = parseFloat(req.query.metaAnual) || 0;
        const anioHistorico  = anioProyeccion - 1;
        const FALLBACK       = 'Cabaña 2';
        const MES_NOMBRES    = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        try {
            const cabanasSnap = await db.collection('cabanas').orderBy('nombre').get();
            const cabanas = cabanasSnap.docs.map(d => d.data().nombre);

            const ts = (y, m, d, h=0, mi=0, s=0) =>
                admin.firestore.Timestamp.fromDate(new Date(Date.UTC(y, m, d, h, mi, s)));

            const [histSnap, proySnap] = await Promise.all([
                db.collection('reservas')
                    .where('fechaLlegada', '>=', ts(anioHistorico, 0, 1))
                    .where('fechaLlegada', '<=', ts(anioHistorico, 11, 31, 23, 59, 59))
                    .get(),
                db.collection('reservas')
                    .where('fechaLlegada', '>=', ts(anioProyeccion, 0, 1))
                    .where('fechaLlegada', '<=', ts(anioProyeccion, 11, 31, 23, 59, 59))
                    .get()
            ]);

            // Initialize monthly arrays per cabin
            const initMonthly = () => cabanas.reduce((acc, c) => {
                acc[c] = Array.from({ length: 12 }, () => ({ noches: 0, monto: 0 }));
                return acc;
            }, {});

            const hist = initMonthly();
            const conf = initMonthly();

            const processSnap = (snap, target) => {
                snap.forEach(doc => {
                    const d = doc.data();
                    if (d.estado !== 'Confirmada') return;
                    const m = d.fechaLlegada.toDate().getUTCMonth();
                    if (!target[d.alojamiento]) return;
                    target[d.alojamiento][m].noches += d.totalNoches || 0;
                    target[d.alojamiento][m].monto  += d.valorCLP   || 0;
                });
            };
            processSnap(histSnap, hist);
            processSnap(proySnap, conf);

            // Historical totals per cabin
            const sumMonthly = (arr) => arr.reduce(
                (s, m) => ({ noches: s.noches + m.noches, monto: s.monto + m.monto }),
                { noches: 0, monto: 0 }
            );
            const histTotals = {};
            cabanas.forEach(c => { histTotals[c] = sumMonthly(hist[c]); });

            // Build fallback distribution:
            // 1st preference: named fallback cabin (Cabaña 2) if it has data
            // 2nd preference: weighted average of ALL cabins that DO have history
            // 3rd: even distribution (1/12 per month)
            const FALLBACK_NAME = 'Cabaña 2';
            const cabsWithData = cabanas.filter(c => histTotals[c].monto > 0 && histTotals[c].noches > 0);

            let fallbackMonthly, fallbackTotal;
            if (cabsWithData.includes(FALLBACK_NAME)) {
                fallbackMonthly = hist[FALLBACK_NAME];
                fallbackTotal   = histTotals[FALLBACK_NAME];
            } else if (cabsWithData.length > 0) {
                // Average across all cabins with data
                const n = cabsWithData.length;
                fallbackTotal = {
                    monto:  cabsWithData.reduce((s, c) => s + histTotals[c].monto,  0) / n,
                    noches: cabsWithData.reduce((s, c) => s + histTotals[c].noches, 0) / n,
                };
                fallbackMonthly = Array.from({ length: 12 }, (_, m) => ({
                    monto:  cabsWithData.reduce((s, c) => s + hist[c][m].monto,  0) / n,
                    noches: cabsWithData.reduce((s, c) => s + hist[c][m].noches, 0) / n,
                }));
            } else {
                // No historical data at all — equal monthly distribution
                fallbackTotal   = { monto: 12, noches: 12 };
                fallbackMonthly = Array.from({ length: 12 }, () => ({ monto: 1, noches: 1 }));
            }

            const getSource = (c) => {
                const t = histTotals[c];
                if (t.noches === 0 || t.monto === 0) {
                    return { monthly: fallbackMonthly, total: fallbackTotal, usingFallback: true };
                }
                return { monthly: hist[c], total: t, usingFallback: false };
            };

            const meses = MES_NOMBRES.map((nombre, m) => {
                const row = { mes: nombre, mesNum: m + 1, cabanas: {} };
                cabanas.forEach(c => {
                    const { monthly, total, usingFallback } = getSource(c);
                    const pctNoches = total.noches > 0 ? monthly[m].noches / total.noches : 0;
                    const pctMonto  = total.monto  > 0 ? monthly[m].monto  / total.monto  : 0;
                    const scale     = total.monto  > 0 ? metaAnual / total.monto           : 0;
                    row.cabanas[c] = {
                        proyNoches:   Math.round(monthly[m].noches * scale),
                        proyMonto:    Math.round(pctMonto * metaAnual),
                        confNoches:   conf[c][m].noches,
                        confMonto:    conf[c][m].monto,
                        pctMes:       parseFloat((pctMonto * 100).toFixed(1)),
                        usingFallback
                    };
                });
                return row;
            });

            // Annual confirmed totals per cabin (for gauges)
            const gauges = {};
            cabanas.forEach(c => {
                const t = sumMonthly(conf[c]);
                gauges[c] = {
                    confMonto:  Math.round(t.monto),
                    confNoches: t.noches,
                    metaAnual,
                    pct: metaAnual > 0 ? parseFloat((t.monto / metaAnual * 100).toFixed(1)) : 0
                };
            });

            const fallbackCabanas = cabanas.filter(c => getSource(c).usingFallback);
            res.json({ cabanas, meses, gauges, anioHistorico, anioProyeccion, metaAnual, fallbackCabanas });
        } catch (err) {
            console.error('[KPI] Proyección anual:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};