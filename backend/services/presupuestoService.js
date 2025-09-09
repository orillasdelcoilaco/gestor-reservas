const admin = require('firebase-admin');

async function getAvailabilityData(db, startDate, endDate) {
    const [cabanasSnapshot, tarifasSnapshot, reservasSnapshot] = await Promise.all([
        db.collection('cabanas').get(),
        db.collection('tarifas').get(),
        db.collection('reservas').where('fechaLlegada', '<', admin.firestore.Timestamp.fromDate(endDate)).get()
    ]);

    const allCabanas = cabanasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const allTarifas = tarifasSnapshot.docs.map(doc => doc.data());
    
    const cabanasConTarifa = allCabanas.filter(cabana => {
        return allTarifas.some(tarifa => {
            const inicioTarifa = tarifa.fechaInicio.toDate();
            const finTarifa = tarifa.fechaTermino.toDate();
            return tarifa.nombreCabaña === cabana.nombre && inicioTarifa <= endDate && finTarifa >= startDate;
        });
    });

    const overlappingReservations = [];
    reservasSnapshot.forEach(doc => {
        const reserva = doc.data();
        if (reserva.fechaSalida.toDate() > startDate && reserva.estado === 'Confirmada') {
            overlappingReservations.push(reserva);
        }
    });
    
    const occupiedCabanaNames = new Set(overlappingReservations.map(reserva => reserva.alojamiento));
    const availableCabanas = cabanasConTarifa.filter(cabana => !occupiedCabanaNames.has(cabana.nombre));
    
    const complexDoc = await db.collection('config').doc('complejo').get();
    const complexDetails = complexDoc.exists ? complexDoc.data() : {};

    return { availableCabanas, allCabanas, allTarifas, complexDetails, overlappingReservations };
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

function findSegmentedCombination(allCabanas, allTarifas, overlappingReservations, requiredCapacity, startDate, endDate) {
    const availabilityMap = new Map();
    allCabanas.forEach(cabana => availabilityMap.set(cabana.nombre, []));
    overlappingReservations.forEach(reserva => {
        if (availabilityMap.has(reserva.alojamiento)) {
            availabilityMap.get(reserva.alojamiento).push({
                start: reserva.fechaLlegada.toDate(),
                end: reserva.fechaSalida.toDate()
            });
        }
    });

    const allDailyOptions = [];
    let isPossible = true;

    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
        const currentDate = new Date(d);
        const dailyAvailableCabanas = allCabanas.filter(cabana => {
            const hasTarifa = allTarifas.some(t => 
                t.nombreCabaña === cabana.nombre &&
                t.fechaInicio.toDate() <= currentDate &&
                t.fechaTermino.toDate() >= currentDate
            );
            if (!hasTarifa) return false;

            const isOccupied = (availabilityMap.get(cabana.nombre) || []).some(res =>
                currentDate >= res.start && currentDate < res.end
            );
            return !isOccupied && cabana.capacidad >= requiredCapacity;
        });

        if (dailyAvailableCabanas.length === 0) {
            isPossible = false;
            break;
        }
        allDailyOptions.push({ date: new Date(currentDate), options: dailyAvailableCabanas });
    }

    if (!isPossible) return { combination: [], capacity: 0, dailyOptions: [] };

    let itinerary = [];
    if (allDailyOptions.length > 0) {
        let currentSegment = {
            cabana: allDailyOptions[0].options[0],
            startDate: allDailyOptions[0].date,
            endDate: new Date(allDailyOptions[0].date).setDate(allDailyOptions[0].date.getDate() + 1)
        };

        for (let i = 1; i < allDailyOptions.length; i++) {
            const day = allDailyOptions[i];
            if (day.options.some(opt => opt.id === currentSegment.cabana.id)) {
                currentSegment.endDate = new Date(day.date).setDate(day.date.getDate() + 1);
            } else {
                itinerary.push(currentSegment);
                currentSegment = {
                    cabana: day.options[0],
                    startDate: day.date,
                    endDate: new Date(day.date).setDate(day.date.getDate() + 1)
                };
            }
        }
        itinerary.push(currentSegment);
    }
    
    const finalCombination = itinerary.map(seg => ({
        ...seg,
        startDate: new Date(seg.startDate),
        endDate: new Date(seg.endDate)
    }));

    return { combination: finalCombination, capacity: requiredCapacity, dailyOptions: allDailyOptions };
}


async function calculatePrice(db, items, startDate, endDate, isSegmented = false) {
    let totalPrice = 0;
    const priceDetails = [];
    
    if (isSegmented) {
        for (const segment of items) {
            const segmentStartDate = segment.startDate instanceof Date ? segment.startDate : new Date(segment.startDate);
            const segmentEndDate = segment.endDate instanceof Date ? segment.endDate : new Date(segment.endDate);

            const segmentNights = Math.max(1, Math.round((segmentEndDate - segmentStartDate) / (1000 * 60 * 60 * 24)));
            const pricing = await calculatePrice(db, [segment.cabana], segmentStartDate, segmentEndDate);
            totalPrice += pricing.totalPrice;
            priceDetails.push({
                nombre: segment.cabana.nombre,
                precioTotal: pricing.totalPrice,
                precioPorNoche: pricing.totalPrice > 0 ? pricing.totalPrice / segmentNights : 0,
                noches: segmentNights,
                fechaInicio: segmentStartDate.toISOString().split('T')[0],
                fechaTermino: segmentEndDate.toISOString().split('T')[0]
            });
        }
        const totalNights = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
        return { totalPrice, nights: totalNights, details: priceDetails };
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