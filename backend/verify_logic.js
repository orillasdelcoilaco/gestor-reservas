const service = require('./services/presupuestoService');
const admin = require('firebase-admin');

// 1. Mock Admin if not initialized
if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: 'mock' });
}

// 2. Mock Data (Same as before but verifying success)
const mockCabanas = [
    { id: 'c7', nombre: 'Cabaña 7', capacidad: 6, camas: { matrimoniales: 1, plazaYMedia: 0, camarotes: 2 } },
    { id: 'c2', nombre: 'Cabaña 2', capacidad: 7, camas: { matrimoniales: 1, plazaYMedia: 1, camarotes: 2 } },
    { id: 'c3', nombre: 'Cabaña 3', capacidad: 6, camas: { matrimoniales: 1, plazaYMedia: 0, camarotes: 2 } }
];

const mockTarifas = [
    {
        nombreCabaña: 'Cabaña 7',
        fechaInicio: { toDate: () => new Date('2025-01-01') },
        fechaTermino: { toDate: () => new Date('2025-03-01') },
        tarifasPorCanal: { SODC: { valor: 100000 } }
    },
    {
        nombreCabaña: 'Cabaña 2',
        fechaInicio: { toDate: () => new Date('2025-01-01') },
        fechaTermino: { toDate: () => new Date('2025-03-01') },
        tarifasPorCanal: { SODC: { valor: 110000 } }
    },
    {
        nombreCabaña: 'Cabaña 3',
        fechaInicio: { toDate: () => new Date('2025-01-01') },
        fechaTermino: { toDate: () => new Date('2025-03-01') },
        tarifasPorCanal: { SODC: { valor: 100000 } }
    }
];

const mockReservas = [
    { alojamiento: 'Cabaña 7', fechaLlegada: { toDate: () => new Date('2025-02-01') }, fechaSalida: { toDate: () => new Date('2025-02-05') } }
];

const mockDb = {
    collection: (name) => {
        return {
            get: async () => {
                if (name === 'cabanas') return { docs: mockCabanas.map(c => ({ id: c.id, data: () => c })) };
                if (name === 'tarifas') return { docs: mockTarifas.map(t => ({ data: () => t })) };
                if (name === 'reservas') return { forEach: (cb) => mockReservas.forEach(r => cb({ data: () => r })) };
                if (name === 'config') return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
                return { docs: [] };
            },
            where: function () { return this; },
            orderBy: function () { return this; },
            limit: function () { return this; },
            get: async () => {
                if (name === 'tarifas') return { empty: false, docs: [{ data: () => mockTarifas[0] }] };
                return { forEach: (cb) => mockReservas.forEach(r => cb({ data: () => r })) };
            }
        };
    }
};

async function run() {
    try {
        console.log("Running Logic Verification...");
        const startDate = new Date('2025-02-07T00:00:00Z');
        const endDate = new Date('2025-02-19T00:00:00Z');
        const personas = 12;

        const { availableCabanas, allCabanas, allTarifas, overlappingReservations } = await service.getAvailabilityData(mockDb, startDate, endDate);

        const result = service.findSegmentedCombination(allCabanas, allTarifas, overlappingReservations, personas, startDate, endDate);

        if (result.combination.length > 0) {
            console.log("LOGIC SUCCESS: Segmented combination found.");
            console.log("Segments:", result.combination.length);

            const pricing = await service.calculatePrice(mockDb, result.combination, startDate, endDate, true);
            console.log("PRICING SUCCESS: Total Price", pricing.totalPrice);
        } else {
            console.error("LOGIC FAILURE: No combination found.");
            process.exit(1);
        }
    } catch (error) {
        console.error("LOGIC CRASHED:", error);
        process.exit(1);
    }
}

run();
