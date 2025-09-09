// backend/services/icalService.js

const admin = require('firebase-admin');

/**
 * Genera el contenido de un archivo iCal para una cabaña específica.
 * @param {admin.firestore.Firestore} db - Instancia de Firestore.
 * @param {string} nombreCabana - El nombre de la cabaña para la cual generar el calendario.
 * @returns {Promise<string>} El contenido del archivo iCal como un string.
 */
async function generateICalForCabana(db, nombreCabana) {
    const today = new Date();
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const startDate = admin.firestore.Timestamp.fromDate(threeMonthsAgo);

    const snapshot = await db.collection('reservas')
        .where('alojamiento', '==', nombreCabana)
        .where('estado', '==', 'Confirmada')
        .where('fechaLlegada', '>=', startDate)
        .get();

    let icalContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//OrillasDelCoilaco//GestorDeReservas//ES',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:Disponibilidad ${nombreCabana}`,
        'X-WR-TIMEZONE:America/Santiago',
    ];

    if (!snapshot.empty) {
        snapshot.forEach(doc => {
            const reserva = doc.data();
            const dtstart = reserva.fechaLlegada.toDate();
            const dtend = reserva.fechaSalida.toDate();
            
            // Formato iCal requiere YYYYMMDD
            const formatDateICal = (date) => {
                return date.toISOString().split('T')[0].replace(/-/g, '');
            };

            icalContent.push('BEGIN:VEVENT');
            icalContent.push(`UID:${doc.id}@orillasdelcoilaco.cl`);
            icalContent.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
            icalContent.push(`DTSTART;VALUE=DATE:${formatDateICal(dtstart)}`);
            icalContent.push(`DTEND;VALUE=DATE:${formatDateICal(dtend)}`);
            icalContent.push(`SUMMARY:Reservado - ${reserva.clienteNombre} (${reserva.canal})`);
            icalContent.push('END:VEVENT');
        });
    }

    icalContent.push('END:VCALENDAR');
    return icalContent.join('\r\n');
}

module.exports = {
    generateICalForCabana
};