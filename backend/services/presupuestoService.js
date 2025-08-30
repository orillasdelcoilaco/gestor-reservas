const admin = require('firebase-admin');

/**
 * Obtiene todos los datos necesarios para un presupuesto.
 */
async function getAvailabilityData(db, startDate, endDate) {
    // Obtener todas las cabañas
    const cabanasSnapshot = await db.collection('cabanas').get();
    const allCabanas = cabanasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Obtener detalles del complejo
    const complexDoc = await db.collection('config').doc('complejo').get();
    const complexDetails = complexDoc.exists ? complexDoc.data() : {};

    // Obtener reservas que se superponen con el rango de fechas
    const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
    const endTimestamp = admin.firestore.Timestamp.fromDate(endDate);

    const reservasQuery1 = db.collection('reservas').where('fechaLlegada', '<', endTimestamp);
    const snapshot1 = await reservasQuery1.get();
    
    const overlappingReservations = [];
    snapshot1.forEach(doc => {
        const reserva = doc.data();
        if (reserva.fechaSalida.toDate() > startDate && reserva.estado !== 'Cancelada') {
            overlappingReservations.push(reserva);
        }
    });

    const occupiedCabanaNames = new Set(overlappingReservations.map(reserva => reserva.alojamiento));
    const availableCabanas = allCabanas.filter(cabana => !occupiedCabanaNames.has(cabana.nombre));
    
    return { availableCabanas, allCabanas, complexDetails };
}

/**
 * Encuentra la combinación óptima de cabañas para un número de personas.
 */
function findBestCombination(availableCabanas, requiredCapacity) {
    const sortedCabanas = [...availableCabanas].sort((a, b) => b.capacidad - a.capacidad);
    
    let combination = [];
    let currentCapacity = 0;
    
    for (const cabana of sortedCabanas) {
        if (currentCapacity < requiredCapacity) {
            combination.push(cabana);
            currentCapacity += cabana.capacidad;
        } else {
            break;
        }
    }

    if (currentCapacity < requiredCapacity) {
        return { combination: [], capacity: 0 };
    }

    return { combination, capacity: currentCapacity };
}

/**
 * Calcula el precio total para una selección de cabañas en un rango de fechas.
 */
async function calculatePrice(db, cabanas, startDate, endDate) {
    const nights = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
    let totalPrice = 0;
    const priceDetails = [];

    for (const cabana of cabanas) {
        let cabanaPrice = 0;
        const q = db.collection('tarifas')
            .where('nombreCabaña', '==', cabana.nombre)
            .where('fechaInicio', '<=', admin.firestore.Timestamp.fromDate(startDate))
            .orderBy('fechaInicio', 'desc')
            .limit(1);
        
        const snapshot = await q.get();

        if (!snapshot.empty) {
            const tarifa = snapshot.docs[0].data();
            if (tarifa.fechaTermino.toDate() >= startDate) {
                if (tarifa.tarifasPorCanal && tarifa.tarifasPorCanal.SODC) {
                    cabanaPrice = tarifa.tarifasPorCanal.SODC.valor * nights;
                }
            }
        }
        
        totalPrice += cabanaPrice;
        priceDetails.push({
            nombre: cabana.nombre,
            precioTotal: cabanaPrice,
            precioPorNoche: cabanaPrice > 0 ? cabanaPrice / nights : 0,
        });
    }

    return {
        totalPrice,
        nights,
        details: priceDetails
    };
}

module.exports = {
    getAvailabilityData,
    findBestCombination,
    calculatePrice
};