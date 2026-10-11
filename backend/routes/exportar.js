// routes/exportar.js
// Exporta reservas, clientes y cabañas en formato JSON estructurado
// para ser usado como muestra/import en SuiteManagers u otro PMS.

const express = require('express');
const admin = require('firebase-admin');

module.exports = function (db) {
    const router = express.Router();

    // GET /api/exportar
    // Query params:
    //   desde     (YYYY-MM-DD) — fecha de llegada desde (default: inicio del año actual)
    //   hasta     (YYYY-MM-DD) — fecha de llegada hasta (default: fin del año actual)
    //   estado    — filtra por estado: Confirmada | Cancelada | todas (default: todas)
    //   formato   — json (default) | json-muestra (solo 5 registros de ejemplo)
    router.get('/exportar', async (req, res) => {
        try {
            const ahora = new Date();
            const desdeStr = req.query.desde || `${ahora.getFullYear()}-01-01`;
            const hastaStr = req.query.hasta || `${ahora.getFullYear()}-12-31`;
            const estadoFiltro = req.query.estado || 'todas';
            const esMuestra = req.query.formato === 'json-muestra';

            const desde = new Date(desdeStr + 'T00:00:00Z');
            const hasta = new Date(hastaStr + 'T23:59:59Z');

            // 1. Cabañas
            const cabanasSnap = await db.collection('cabanas').get();
            const cabanas = cabanasSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // 2. Reservas en rango
            let query = db.collection('reservas')
                .where('fechaLlegada', '>=', admin.firestore.Timestamp.fromDate(desde))
                .where('fechaLlegada', '<=', admin.firestore.Timestamp.fromDate(hasta))
                .orderBy('fechaLlegada', 'asc');

            const reservasSnap = await query.get();
            let reservasDocs = reservasSnap.docs;

            if (estadoFiltro !== 'todas') {
                reservasDocs = reservasDocs.filter(d => d.data().estado === estadoFiltro);
            }
            if (esMuestra) {
                reservasDocs = reservasDocs.slice(0, 5);
            }

            // 3. Clientes únicos referenciados por esas reservas
            const clienteIds = [...new Set(
                reservasDocs.map(d => d.data().clienteId).filter(Boolean)
            )];

            const clientesMap = {};
            // Firestore 'in' permite max 30 por query
            for (let i = 0; i < clienteIds.length; i += 30) {
                const chunk = clienteIds.slice(i, i + 30);
                const snap = await db.collection('clientes').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
                snap.forEach(doc => { clientesMap[doc.id] = { id: doc.id, ...doc.data() }; });
            }

            // 4. Transacciones (pagos) por reserva
            const reservas = [];
            for (const doc of reservasDocs) {
                const r = doc.data();

                // Convertir Timestamps a ISO string
                const tsToISO = (ts) => ts && ts.toDate ? ts.toDate().toISOString() : ts || null;

                // Transacciones (subcollection)
                const txSnap = await doc.ref.collection('transacciones').orderBy('fecha', 'asc').get();
                const transacciones = txSnap.docs.map(tx => {
                    const t = tx.data();
                    return {
                        id: tx.id,
                        monto: t.monto || 0,
                        medioDePago: t.medioDePago || '',
                        tipo: t.tipo || '',
                        fecha: tsToISO(t.fecha),
                        enlaceComprobante: t.enlaceComprobante || null,
                    };
                });

                reservas.push({
                    // IDs
                    id: doc.id,
                    reservaIdOriginal: r.reservaIdOriginal || doc.id,

                    // Cliente
                    clienteId: r.clienteId || null,
                    clienteNombre: r.clienteNombre || '',
                    telefono: r.telefono || '',
                    correo: r.correo || '',

                    // Alojamiento
                    alojamiento: r.alojamiento || '',

                    // Fechas
                    fechaReserva: tsToISO(r.fechaReserva),
                    fechaLlegada: tsToISO(r.fechaLlegada),
                    fechaSalida: tsToISO(r.fechaSalida),
                    totalNoches: r.totalNoches || 0,
                    invitados: r.invitados || 1,

                    // Estado
                    estado: r.estado || '',
                    estadoGestion: r.estadoGestion || '',

                    // Canal de origen
                    canal: r.canal || '',

                    // Valores económicos
                    monedaOriginal: r.monedaOriginal || 'CLP',
                    valorOriginal: r.valorOriginal || null,
                    valorDolarDia: r.valorDolarDia || null,
                    valorCLP: r.valorCLP || 0,
                    valorPotencialCLP: r.valorPotencialCLP || 0,
                    descuento: r.descuento || null,
                    comision: r.comision || 0,

                    // Pagos
                    abono: r.abono || 0,
                    pendiente: r.pendiente || 0,
                    pagado: r.pagado || false,

                    // Flags
                    boleta: r.boleta || false,
                    precioIncluyeIva: r.precioIncluyeIva !== undefined ? r.precioIncluyeIva : true,
                    valorManual: r.valorManual || false,
                    valorDolarFijo: r.valorDolarFijo || false,

                    // Documentos
                    documentos: {
                        enlaceReserva: r.documentos?.enlaceReserva || null,
                        enlaceBoleta: r.documentos?.enlaceBoleta || null,
                    },

                    // Pagos detallados
                    transacciones,

                    // Info de rechazo si aplica
                    rechazoInfo: r.rechazoInfo ? {
                        motivo: r.rechazoInfo.motivo || '',
                        nota: r.rechazoInfo.nota || '',
                        fecha: tsToISO(r.rechazoInfo.fecha),
                    } : null,
                });
            }

            // 5. Clientes exportados (solo los que tienen reservas en el rango)
            const clientes = Object.values(clientesMap).map(c => ({
                id: c.id,
                nombre: `${c.firstname || ''} ${c.lastname || ''}`.trim(),
                firstname: c.firstname || '',
                lastname: c.lastname || '',
                telefono: c.phone || '',
                email: c.email || '',
                pais: c.pais || '',
                region: c.region || '',
                ciudad: c.ciudad || '',
                canal: c.canal || '',
                notas: c.notas || '',
                calificacion: c.calificacion || null,
            }));

            const payload = {
                meta: {
                    exportadoEn: new Date().toISOString(),
                    version: '1.0',
                    sistema: 'Gestor de Reservas - Orillas del Coilaco',
                    filtros: {
                        desde: desdeStr,
                        hasta: hastaStr,
                        estado: estadoFiltro,
                        esMuestra,
                    },
                    totales: {
                        reservas: reservas.length,
                        clientes: clientes.length,
                        cabanas: cabanas.length,
                    }
                },
                cabanas,
                clientes,
                reservas,
            };

            // Descargar como archivo JSON
            const filename = esMuestra
                ? `muestra-reservas-${desdeStr}-${hastaStr}.json`
                : `exportacion-reservas-${desdeStr}-${hastaStr}.json`;

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.json(payload);

        } catch (err) {
            console.error('Error en exportación:', err);
            res.status(500).json({ error: 'Error al generar exportación', detalle: err.message });
        }
    });

    return router;
};
