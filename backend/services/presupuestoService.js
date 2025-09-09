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
    return { availableCabanas, allCabanas, complexDetails, overlappingReservations };
}

function findNormalCombination(availableCabanas, requiredCapacity, sinCamarotes = false) {
    let cabanasToConsider = availableCabanas.map(c => {
        const effectiveCapacity = sinCamarotes 
            ? ((c.camas.matrimoniales || 0) * 2) + (c.camas.plazaYMedia || 0) + (c.camas.camarotes || 0)
            : c.capacidad;
        return { ...c, effectiveCapacity };
    });

    cabanasToConsider = cabanasToConsider.filter(c => c.effectiveCapacity > 0);
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

function findSegmentedCombination(allCabanas, overlappingReservations, requiredCapacity, startDate, endDate) {
    const availabilityMap = new Map();
    for (const cabana of allCabanas) {
        availabilityMap.set(cabana.nombre, []);
    }

    for (const reserva of overlappingReservations) {
        if (availabilityMap.has(reserva.alojamiento)) {
            availabilityMap.get(reserva.alojamiento).push({
                start: reserva.fechaLlegada.toDate(),
                end: reserva.fechaSalida.toDate()
            });
        }
    }

    let currentItinerary = [];
    let lastCabana = null;
    let segmentStart = new Date(startDate);

    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
        const currentDate = new Date(d);
        let foundCabanaForDay = false;

        const sortedCabanas = allCabanas.sort((a, b) => a.capacidad - b.capacidad);

        for (const cabana of sortedCabanas) {
            if (cabana.capacidad >= requiredCapacity) {
                const reservationsForCabana = availabilityMap.get(cabana.nombre) || [];
                const isOccupied = reservationsForCabana.some(res => currentDate >= res.start && currentDate < res.end);
                
                if (!isOccupied) {
                    if (lastCabana && cabana.nombre !== lastCabana) {
                        currentItinerary.push({
                            cabana: allCabanas.find(c => c.nombre === lastCabana),
                            startDate: new Date(segmentStart),
                            endDate: new Date(currentDate)
                        });
                        segmentStart = new Date(currentDate);
                    }
                    lastCabana = cabana.nombre;
                    foundCabanaForDay = true;
                    break;
                }
            }
        }

        if (!foundCabanaForDay) {
            return { combination: [], capacity: 0 }; // No se pudo cubrir toda la estadía
        }
    }

    if (lastCabana) {
        currentItinerary.push({
            cabana: allCabanas.find(c => c.nombre === lastCabana),
            startDate: new Date(segmentStart),
            endDate: new Date(endDate)
        });
    }
    
    return { combination: currentItinerary, capacity: requiredCapacity };
}


async function calculatePrice(db, items, startDate, endDate, isSegmented = false) {
    let totalPrice = 0;
    const priceDetails = [];
    
    if (isSegmented) {
        for (const segment of items) {
            const segmentNights = Math.max(1, Math.round((segment.endDate - segment.startDate) / (1000 * 60 * 60 * 24)));
            const pricing = await calculatePrice(db, [segment.cabana], segment.startDate, segment.endDate);
            totalPrice += pricing.totalPrice;
            priceDetails.push({
                nombre: segment.cabana.nombre,
                precioTotal: pricing.totalPrice,
                precioPorNoche: pricing.totalPrice > 0 ? pricing.totalPrice / segmentNights : 0,
                noches: segmentNights,
                fechaInicio: segment.startDate.toISOString().split('T')[0],
                fechaTermino: segment.endDate.toISOString().split('T')[0]
            });
        }
        return { totalPrice, nights: Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)), details: priceDetails };
    } else {
        const nights = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
        for (const cabana of items) {
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
}

module.exports = {
    getAvailabilityData,
    findNormalCombination,
    findSegmentedCombination,
    calculatePrice
};