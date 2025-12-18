const service = require('./services/presupuestoService');

// Mock Data
const mockCabanas = [
    { id: 'c8', nombre: 'Cabaña 8', capacidad: 6 },
    { id: 'c3', nombre: 'Cabaña 3', capacidad: 6 }
];

const mockTarifas = [
    {
        nombreCabaña: 'Cabaña 8',
        fechaInicio: { toDate: () => new Date('2026-01-01') },
        fechaTermino: { toDate: () => new Date('2026-12-31') },
        tarifasPorCanal: { SODC: { valor: 100000 } }
    },
    {
        nombreCabaña: 'Cabaña 3',
        fechaInicio: { toDate: () => new Date('2026-01-01') },
        fechaTermino: { toDate: () => new Date('2026-12-31') },
        tarifasPorCanal: { SODC: { valor: 90000 } }
    }
];

// No reservations = Free
const mockReservas = [];

const startDate = new Date('2026-02-07T00:00:00Z');
const endDate = new Date('2026-02-09T00:00:00Z'); // Just 2 days to test concurrency
const personas = 12;

console.log("Testing 12 Pax with C8 (6) + C3 (6)...");
const result = service.findSegmentedCombination(mockCabanas, mockTarifas, mockReservas, personas, startDate, endDate);

console.log(`Combination Length: ${result.combination.length}`);
result.combination.forEach((seg, i) => {
    console.log(`Segment ${i}: ${seg.cabana.nombre} (${seg.startDate.toISOString()} to ${seg.endDate.toISOString()})`);
});

// Check for duplicates in same period
const usedPerDay = new Map();
let doubleBooked = false;

result.combination.forEach(seg => {
    // Check overlapping usage
    // Logic: For each day of segment, check if cabin used
    for (let d = new Date(seg.startDate); d < seg.endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (!usedPerDay.has(dateStr)) usedPerDay.set(dateStr, new Set());

        if (usedPerDay.get(dateStr).has(seg.cabana.nombre)) {
            console.log(`FAIL: Cabin ${seg.cabana.nombre} used twice on ${dateStr}`);
            doubleBooked = true;
        }
        usedPerDay.get(dateStr).add(seg.cabana.nombre);
    }
});

if (doubleBooked) {
    console.log("FAIL: Double Booking detected.");
} else {
    console.log("SUCCESS: No Double Booking.");
}

// Check posiblesCabanas
let optionsMissing = false;
result.combination.forEach(seg => {
    if (!seg.posiblesCabanas || seg.posiblesCabanas.length === 0) {
        // It's possible to have 0 alternatives if only 1 cabin fits, 
        // but in our mock we might expect C8 and C3 to be swappable if Capacity matches?
        // Actually, for 12 pax, both are needed. So neither has an alternative that accounts for the *other* being used?
        // Wait. 'posiblesCabanas' ignores solution usage? 
        // My fix checks `isUsedInSolution`.
        // If I use C8, is C3 an option? 
        // Yes, if C3 is NOT used. But C3 IS used in this solution.
        // So for 12 pax (Full Capacity), there might be NO alternatives.
        console.log(`Segment ${seg.cabana.nombre}: Options count = ${seg.posiblesCabanas ? seg.posiblesCabanas.length : 'undefined'}`);
    } else {
        console.log(`Segment ${seg.cabana.nombre}: Options found (${seg.posiblesCabanas.length}).`);
    }
    if (!seg.posiblesCabanas) optionsMissing = true;
});

if (optionsMissing) console.log("FAIL: POSIBLES CABANAS MISSING");
else console.log("SUCCESS: Structure includes options.");
