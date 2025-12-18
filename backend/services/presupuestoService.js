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
    // 1. Availability Map
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

    // 2. Track capacity needed per day
    const dailyNeeds = new Map();
    // TRACKING FIX: Also track which cabins are used in the CURRENT solution to avoid double booking
    const solutionOccupancy = new Map(); // Map<DateString, Set<CabinName>>

    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dailyNeeds.set(dateStr, requiredCapacity);
        solutionOccupancy.set(dateStr, new Set());
    }

    const resultSegments = [];

    // 3. Greedy Allocation
    let daysToCheck = Array.from(dailyNeeds.keys()).sort();
    let attempts = 0;

    // Determine complex config (if needed for filtering, ignored for now as typical logic applies)

    while (daysToCheck.length > 0 && attempts < 500) {
        attempts++;

        // Find first unsatisfied day
        const currentDayStr = daysToCheck.find(dateStr => dailyNeeds.get(dateStr) > 0);
        if (!currentDayStr) break;

        const currentDayDate = new Date(currentDayStr + 'T00:00:00Z');

        // Filter candidates valid for THIS day
        const candidates = allCabanas.filter(cabana => {
            // Tariff Check
            const hasTarifa = allTarifas.some(t =>
                t.nombreCabaña === cabana.nombre &&
                t.fechaInicio.toDate() <= currentDayDate &&
                t.fechaTermino.toDate() >= currentDayDate
            );
            if (!hasTarifa) return false;

            // Reservation Check (DB)
            const isReserved = (availabilityMap.get(cabana.nombre) || []).some(res =>
                currentDayDate >= res.start && currentDayDate < res.end
            );
            if (isReserved) return false;

            // Solution Check (Dynamic - Prevent Double Booking)
            const isUsedInSolution = solutionOccupancy.get(currentDayStr).has(cabana.nombre);
            if (isUsedInSolution) return false;

            return true;
        });

        if (candidates.length === 0) {
            // No cabins available for this specific day to meet remaining demand
            return { combination: [], capacity: 0, dailyOptions: [], message: `No cabins available on ${currentDayStr}` };
        }

        // Find Best Candidate (Greedy by Duration)
        let bestCandidate = null;
        let bestDuration = 0;

        for (const cabana of candidates) {
            let duration = 0;
            let d = new Date(currentDayDate);
            while (d < endDate) {
                const dateStr = d.toISOString().split('T')[0];
                // Check if we still need capacity? 
                // Optimization: We can fill even if need is 0, but usually we stop if blocked.

                // Checks:
                const isReserved = (availabilityMap.get(cabana.nombre) || []).some(res => d >= res.start && d < res.end);
                const isUsedInSol = solutionOccupancy.get(dateStr) && solutionOccupancy.get(dateStr).has(cabana.nombre);
                const hasTarifa = allTarifas.some(t => t.nombreCabaña === cabana.nombre && t.fechaInicio.toDate() <= d && t.fechaTermino.toDate() >= d);

                if (isReserved || isUsedInSol || !hasTarifa) break;

                duration++;
                d.setDate(d.getDate() + 1);
            }

            if (duration > bestDuration) {
                bestDuration = duration;
                bestCandidate = cabana;
            } else if (duration === bestDuration) {
                // Tie-breaker: larger capacity first?
                if (!bestCandidate || cabana.capacidad > bestCandidate.capacidad) {
                    bestCandidate = cabana;
                }
            }
        }

        if (!bestCandidate) return { combination: [], capacity: 0 };

        const segmentEnd = new Date(currentDayDate);
        segmentEnd.setDate(segmentEnd.getDate() + bestDuration);

        // POPULATE POSIBLES CABANAS:
        // Find all cabins that are ALSO valid for this exact duration and start date
        // taking into account Solution Occupancy (exclude those used by OTHERS, but logic is tricky here)
        // Actually, 'posiblesCabanas' usually means "Alternatives for this segment".
        // A valid alternative must be free for [currentDay, currentDay + bestDuration).
        const possibles = candidates.filter(c => {
            let valid = true;
            let d = new Date(currentDayDate);
            for (let i = 0; i < bestDuration; i++) {
                const dateStr = d.toISOString().split('T')[0];
                const isReserved = (availabilityMap.get(c.nombre) || []).some(res => d >= res.start && d < res.end);
                // Important: It must NOT be used by *other* segments on these days.
                // But 'solutionOccupancy' includes 'bestCandidate' AFTER we start loop? No, we haven't updated it yet.
                // So checking solutionOccupancy is correct.
                const isUsedInSol = solutionOccupancy.get(dateStr).has(c.nombre);
                const hasTarifa = allTarifas.some(t => t.nombreCabaña === c.nombre && t.fechaInicio.toDate() <= d && t.fechaTermino.toDate() >= d);

                if (isReserved || isUsedInSol || !hasTarifa) {
                    valid = false;
                    break;
                }
                d.setDate(d.getDate() + 1);
            }
            return valid;
        });

        resultSegments.push({
            cabana: bestCandidate,
            cabanaId: bestCandidate.id,
            startDate: new Date(currentDayDate),
            endDate: new Date(segmentEnd),
            posiblesCabanas: possibles // Added for dropdown
        });

        // Update Needs & Occupancy
        let d = new Date(currentDayDate);
        for (let i = 0; i < bestDuration; i++) {
            const dateStr = d.toISOString().split('T')[0];
            if (dailyNeeds.has(dateStr)) {
                // Update need
                const currentNeed = dailyNeeds.get(dateStr);
                dailyNeeds.set(dateStr, Math.max(0, currentNeed - bestCandidate.capacidad));

                // Mark occupied
                solutionOccupancy.get(dateStr).add(bestCandidate.nombre);
            }
            d.setDate(d.getDate() + 1);
        }

        daysToCheck = Array.from(dailyNeeds.keys()).filter(k => dailyNeeds.get(k) > 0).sort();
    }

    const unsatisfied = Array.from(dailyNeeds.values()).some(v => v > 0);
    if (unsatisfied) {
        return { combination: [], capacity: 0, dailyOptions: [] };
    }

    return { combination: resultSegments, capacity: requiredCapacity, dailyOptions: [], isSegmented: true };
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
        const nights = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
        if (nights === 0) {
            return { totalPrice: 0, nights: 0, details: [] };
        }

        for (const cabana of items) {
            let cabanaTotalPrice = 0;

            for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
                const currentDate = new Date(d);
                const q = db.collection('tarifas')
                    .where('nombreCabaña', '==', cabana.nombre)
                    .where('fechaInicio', '<=', admin.firestore.Timestamp.fromDate(currentDate))
                    .orderBy('fechaInicio', 'desc')
                    .limit(1);

                const snapshot = await q.get();

                if (!snapshot.empty) {
                    const tarifa = snapshot.docs[0].data();
                    if (tarifa.fechaTermino.toDate() >= currentDate) {
                        if (tarifa.tarifasPorCanal && tarifa.tarifasPorCanal.SODC) {
                            cabanaTotalPrice += tarifa.tarifasPorCanal.SODC.valor;
                        }
                    }
                }
            }

            totalPrice += cabanaTotalPrice;
            priceDetails.push({
                nombre: cabana.nombre,
                precioTotal: cabanaTotalPrice,
                precioPorNoche: cabanaTotalPrice > 0 ? cabanaTotalPrice / nights : 0,
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