const XLSX = require('xlsx');
const admin = require('firebase-admin');

/**
 * Servicio para conciliar reportes de Booking.com con la base de datos interna.
 */
class BookingReconciliationService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Procesa el archivo de reporte y genera un análisis de discrepancias.
     * @param {Buffer} buffer - Buffer del archivo subido.
     * @param {string} mimetype - Tipo MIME del archivo.
     * @returns {Promise<Object>} Resultado del análisis.
     */
    async processReconciliation(buffer, mimetype) {
        try {
            console.log("Iniciando procesamiento de archivo de conciliación...");

            // 1. Parsear el archivo (Soporta Excel y CSV gracias a XLSX)
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet);

            console.log(`Filas leídas del archivo: ${rows.length}`);

            const results = [];
            let totalBookingUSD = 0;
            let totalCommissionUSD = 0;

            // 2. Iterar sobre cada fila del reporte
            for (const row of rows) {
                // Adaptar nombres de columnas según el reporte de Booking estándar
                // Booking suele usar encabezados como 'Reservation number', 'Final amount', etc.
                // Intentaremos mapear los campos clave.

                const reservationId = this.normalizeValue(row['Reservation number'] || row['booking_id'] || row['num_reserva']);
                const guestName = row['Guest name'] || row['guest_name'] || row['huesped'] || 'Desconocido';
                const originalAmount = this.parseCurrency(row['Original amount'] || row['original_amount'] || 0);
                const finalAmount = this.parseCurrency(row['Final amount'] || row['final_amount'] || 0);
                const commissionAmount = this.parseCurrency(row['Commission amount'] || row['commission_amount'] || 0);
                const bookingStatus = (row['Status'] || row['status'] || '').toUpperCase();
                const arrivalDate = row['Arrival'] || row['checkin'];
                const departureDate = row['Departure'] || row['checkout'];
                const currency = row['Currency'] || row['currency'] || 'USD';

                if (!reservationId) {
                    // Fila inválida o resumen
                    continue;
                }

                totalBookingUSD += finalAmount;
                totalCommissionUSD += commissionAmount;

                // 3. Buscar en Firestore
                // Booking IDs suelen ser números grandes strings. 
                // En nuestro sistema, el ID original se guarda en `reservaIdOriginal`.

                let internalReservation = null;
                const snapshot = await this.db.collection('reservas')
                    .where('reservaIdOriginal', '==', String(reservationId))
                    .get();

                if (!snapshot.empty) {
                    // Agrupación de valores por si la reserva tiene múltiples documentos (ej. múltiples cabañas)
                    internalReservation = {
                        estado: snapshot.docs[0].data().estado, // Tomamos estado del primero (usualmente consistente)
                        estadoGestion: snapshot.docs[0].data().estadoGestion,
                        valorDolarDia: snapshot.docs[0].data().valorDolarDia,
                        valorCLP: 0,
                        valorTotalUSD: 0,
                        abono: 0
                    };

                    snapshot.forEach(doc => {
                        const data = doc.data();
                        internalReservation.valorCLP += (data.valorCLP || 0);
                        internalReservation.valorTotalUSD += (data.valorTotalUSD || 0); // Ojo: Si esto tiene IVA, también habrá que descontarlo
                        internalReservation.abono += (data.abono || 0);
                    });
                }

                // 4. Comparar y construir el resultado de la fila
                const analysis = this.analyzeRow(internalReservation, {
                    reservationId,
                    finalAmount,
                    originalAmount, // Pasamos el monto original
                    bookingStatus,
                    guestName,
                    currency
                });

                results.push({
                    reservationId,
                    guestName,
                    dates: `${arrivalDate} - ${departureDate}`,
                    bookingData: {
                        status: bookingStatus,
                        amount: finalAmount,
                        originalAmount: originalAmount, // Guardamos para mostrar
                        commission: commissionAmount,
                        currency: currency
                    },
                    internalData: internalReservation ? {
                        status: internalReservation.estado || 'N/A', // Estado del flujo ('Confirmada', etc.)
                        estadoGestion: internalReservation.estadoGestion || 'N/A', // Estado de gestión ('Pendiente Pago')
                        // Guardamos valores originales (Brutos) para referencia
                        totalCLP: internalReservation.valorCLP,
                        totalUSD: internalReservation.valorTotalUSD,
                        valorDolarDia: internalReservation.valorDolarDia || 0, // Nuevo campo
                        paid: internalReservation.abono || 0,
                        // Valores calculados netos para debugging si fuera necesario
                        netoCalculadoUSD: analysis.internalNetUSD
                    } : null,
                    discrepancies: analysis.discrepancies,
                    matchStatus: analysis.matchStatus // 'MATCH', 'MISMATCH', 'NOT_FOUND'
                });
            }

            const reportData = {
                summary: {
                    totalRows: rows.length,
                    processedRows: results.length,
                    totalBookingUSD,
                    totalCommissionUSD,
                    totalDiscrepancies: results.filter(r => r.matchStatus !== 'MATCH').length
                },
                details: results,
                metadata: {
                    filename: mimetype.filename || 'reporte.csv', // Ajustaremos esto en el controlador
                    date: admin.firestore.FieldValue.serverTimestamp(),
                    processedAt: new Date().toISOString()
                }
            };

            // 5. Persistir Reporte
            await this.db.collection('reportes_conciliacion').add(reportData);
            console.log("Reporte de conciliación guardado exitosamente.");

            return reportData;

        } catch (error) {
            console.error("Error en processReconciliation:", error);
            throw new Error("Error al procesar el archivo de conciliación: " + error.message);
        }
    }

    /**
     * Compara los datos del reporte con los datos internos.
     * @param {Object} internal - Datos de la reserva interna.
     * @param {Object} report - Datos de la fila del reporte de Booking.
     * @returns {Object} Objeto con el estado de coincidencia, discrepancias y el valor neto USD calculado internamente.
     */
    analyzeRow(internal, report) {
        const discrepancies = [];
        let matchStatus = 'MATCH';
        let internalNetUSD = 0;

        if (!internal) {
            return { matchStatus: 'NOT_FOUND', discrepancies: ['Reserva no encontrada en el sistema'] };
        }

        // 1. Comparar Estado
        // Mapeo simple de estados de Booking a internos si es necesario
        // Booking: OK, CANCELLED, NO_SHOW
        const bStatus = report.bookingStatus;
        const iStatus = (internal.estado || '').toUpperCase(); // Confirmada, Cancelada, etc.

        // Ajuste: si dice 'reconciliacion' o similar, considerar ok. 
        // Simplificación: Solo flagging discrepancias obvias
        let statusMismatch = false;
        if (bStatus === 'OK' && iStatus === 'CANCELADA') statusMismatch = true;
        if (bStatus === 'CANCELLED' && iStatus === 'CONFIRMADA') statusMismatch = true;

        // Si booking cobra comisión por un NO SHOW o cancelación tardía, el estado en booking podría ser diferente 
        // o el monto ser > 0 aunque esté cancelada. Eso es complejo, por ahora marcamos diferencia básica.

        if (statusMismatch) {
            discrepancies.push(`Estado diferente: Booking ${bStatus} vs Interno ${iStatus}`);
        }

        // 2. Comparar Montos (Booking NETO vs Interno BRUTO -> NETO)
        // IVA Chile: 19%.  Neto = Bruto / 1.19
        const IVA_DIVISOR = 1.19;
        const tolerance = 2.0; // Tolerancia de 2 USD por redondeos

        // EXCEPCIÓN: Reservas Canceladas
        // Si ambas están canceladas, comparar el monto original de Booking con el interno para referencia.
        if (bStatus === 'CANCELLED' && (iStatus === 'CANCELADA' || iStatus === 'CANCELADO')) {
            // Usamos Original Amount (Neto) vs Interno (Neto)
            const bookingRefAmount = report.originalAmount || 0;

            if (internal.valorCLP && internal.valorDolarDia) {
                internalNetUSD = (internal.valorCLP / internal.valorDolarDia) / IVA_DIVISOR;
            } else if (internal.valorTotalUSD) {
                internalNetUSD = internal.valorTotalUSD / IVA_DIVISOR;
            }

            if (Math.abs(bookingRefAmount - (internalNetUSD || 0)) < tolerance) {
                matchStatus = 'CANCELLED_MATCH'; // Coinciden historico
            } else {
                // Si no coinciden los montos históricos, igual es match de estado, pero con aviso
                matchStatus = 'CANCELLED_REF_MISMATCH';
                discrepancies.push(`Monto Referencial diferente: Booking Original $${bookingRefAmount.toFixed(2)} vs Interno Calc $${(internalNetUSD || 0).toFixed(2)}`);
            }

        } else if (report.currency === 'USD') {
            // Estrategia: Calcular el Neto USD Interno

            // Preferimos calcular desde CLP ya que es la moneda base del sistema y sabemos que tiene IVA
            if (internal.valorCLP && internal.valorDolarDia) {
                const brutoUSD = internal.valorCLP / internal.valorDolarDia;
                internalNetUSD = brutoUSD / IVA_DIVISOR;
            } else if (internal.valorTotalUSD) {
                // Fallback si no hay CLP pero sí USD (podría pasar en casos raros)
                internalNetUSD = internal.valorTotalUSD / IVA_DIVISOR;
            }

            // Si la reserva interna no tiene valor USD ni forma de calcularlo
            if (!internalNetUSD && internalNetUSD !== 0) { // Check explícito por si es 0
                if (internal.valorCLP === 0) {
                    // Si es 0 CLP, asumimos 0 USD.
                    internalNetUSD = 0;
                } else {
                    discrepancies.push('Falta valor interno (CLP+Tasa o USD) para calcular neto');
                }
            }

            if (internalNetUSD !== undefined) {
                // Comparar Neto Booking vs Neto Interno
                const diff = Math.abs(report.finalAmount - internalNetUSD);
                if (diff > tolerance) {
                    discrepancies.push(`Monto Neto USD diferente: Booking $${report.finalAmount.toFixed(2)} vs Interno Calc $${internalNetUSD.toFixed(2)} (Bruto/1.19)`);
                }
            }
        }

        if (discrepancies.length > 0) {
            matchStatus = 'MISMATCH';
        }

        return { matchStatus, discrepancies, internalNetUSD };
    }

    normalizeValue(val) {
        if (val === undefined || val === null) return '';
        return String(val).trim();
    }

    parseCurrency(val) {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            // Eliminar simbolos de moneda y comas si es formato europeo/americano mixto
            // Asumimos formato estándar float en el CSV parseado por XLSX
            return parseFloat(val.replace(/[$,\s]/g, '')) || 0;
        }
        return 0;
    }

    async getHistory() {
        try {
            const snapshot = await this.db.collection('reportes_conciliacion')
                .orderBy('metadata.date', 'desc')
                .limit(20) // Ultimos 20 reportes
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                details: undefined // No enviamos detalles pesados en la lista
            }));
        } catch (error) {
            console.error("Error al obtener historial:", error);
            throw new Error("No se pudo obtener el historial.");
        }
    }

    async deleteReport(id) {
        try {
            await this.db.collection('reportes_conciliacion').doc(id).delete();
            return { success: true };
        } catch (error) {
            console.error("Error al eliminar reporte:", error);
            throw new Error("No se pudo eliminar el reporte.");
        }
    }
    async getReportById(id) {
        try {
            const doc = await this.db.collection('reportes_conciliacion').doc(id).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error al obtener reporte:", error);
            throw new Error("No se pudo obtener el reporte.");
        }
    }
}

module.exports = BookingReconciliationService;
