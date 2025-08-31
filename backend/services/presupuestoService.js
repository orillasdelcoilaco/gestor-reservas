const admin = require('firebase-admin');

async function getAvailabilityData(db, startDate, endDate) {
    const cabanasSnapshot = await db.collection('cabanas').get();
    const allCabanas = cabanasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const complexDoc = await db.collection('config').doc('complejo').get();
    const complexDetails = complexDoc.exists ? complexDoc.data() : {};
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

// --- FUNCIÓN ACTUALIZADA ---
function findBestCombination(availableCabanas, requiredCapacity, sinCamarotes = false) {
    // Calcula la capacidad efectiva de cada cabaña según el filtro
    let cabanasToConsider = availableCabanas.map(c => {
        const effectiveCapacity = sinCamarotes 
            ? ((c.camas.matrimoniales || 0) * 2) + (c.camas.plazaYMedia || 0) + (c.camas.camarotes || 0)
            : c.capacidad;
        return { ...c, effectiveCapacity };
    });

    // Filtra las cabañas que no tienen capacidad bajo el criterio actual
    cabanasToConsider = cabanasToConsider.filter(c => c.effectiveCapacity > 0);
    // Ordena por la capacidad efectiva para encontrar la mejor combinación
    const sortedCabanas = cabanasToConsider.sort((a, b) => b.effectiveCapacity - a.effectiveCapacity);
    
    let combination = [];
    let currentCapacity = 0;
    
    for (const cabana of sortedCabanas) {
        if (currentCapacity < requiredCapacity) {
            combination.push(cabana);
            currentCapacity += cabana.effectiveCapacity;
        } else {
            break;
        }
    }

    if (currentCapacity < requiredCapacity) {
        return { combination: [], capacity: 0 };
    }

    return { combination, capacity: currentCapacity };
}

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
    return { totalPrice, nights, details: priceDetails };
}

module.exports = {
    getAvailabilityData,
    findBestCombination,
    calculatePrice
};