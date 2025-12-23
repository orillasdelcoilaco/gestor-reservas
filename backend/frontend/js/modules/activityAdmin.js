// backend/frontend/js/modules/activityAdmin.js
import { db } from '../firebase-init.js';
import { collection, query, where, onSnapshot, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// DOM Elements
let modal, btnOpen, btnClose;
let elTitle, elCurrentMonth, btnPrevMonth, btnNextMonth, btnBack;
let viewCalendar, viewDay, viewCabin;
let gridCalendar, listDay, listTasks;
let detailCabinName, detailWorker;

// State
let currentDate = new Date(); // To track month
let selectedDate = null;
let selectedCabin = null;

let executedCache = []; // Real tasks (planAseo)
let reservationsCache = []; // Bookings
let combinedTasksCache = []; // Merged

let unsubscribeExecuted = null;

export function initActivityAdmin() {
    // Modal & Main Nav
    modal = document.getElementById('admin-activities-modal');
    btnOpen = document.getElementById('btn-workflow-actividades');
    btnClose = document.getElementById('close-admin-activities');

    // Calendar Header
    elTitle = document.getElementById('act-title');
    elCurrentMonth = document.getElementById('act-current-month');
    btnPrevMonth = document.getElementById('act-prev-month');
    btnNextMonth = document.getElementById('act-next-month');
    btnBack = document.getElementById('act-back-btn');

    // Views
    viewCalendar = document.getElementById('act-view-calendar');
    viewDay = document.getElementById('act-view-day');
    viewCabin = document.getElementById('act-view-cabin');

    // Content Containers
    gridCalendar = document.getElementById('act-calendar-grid');
    listDay = document.getElementById('act-day-list');
    listTasks = document.getElementById('act-task-list');
    detailCabinName = document.getElementById('act-detail-cabin-name');
    detailWorker = document.getElementById('act-detail-worker');

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnPrevMonth) btnPrevMonth.addEventListener('click', () => changeMonth(-1));
    if (btnNextMonth) btnNextMonth.addEventListener('click', () => changeMonth(1));
    if (btnBack) btnBack.addEventListener('click', goBack);
}

function openModal() {
    if (modal) modal.classList.remove('hidden');
    currentDate = new Date();
    loadMonthData(); // Initial Load
    showView('calendar');
}

function closeModal() {
    if (modal) modal.classList.add('hidden');
    if (unsubscribeExecuted) unsubscribeExecuted();
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    loadMonthData();
}

function goBack() {
    if (!viewCabin.classList.contains('hidden')) {
        showView('day'); // Back from Cabin to Day
    } else if (!viewDay.classList.contains('hidden')) {
        showView('calendar'); // Back from Day to Calendar
    }
}

function showView(viewName) {
    // Hide all
    viewCalendar.classList.add('hidden');
    viewDay.classList.add('hidden');
    viewCabin.classList.add('hidden');
    btnBack.classList.add('hidden');
    elCurrentMonth.parentElement.classList.remove('hidden'); // Show month nav by default

    // Logic
    if (viewName === 'calendar') {
        viewCalendar.classList.remove('hidden');
        elTitle.textContent = 'Control de Actividades';
    } else if (viewName === 'day') {
        viewDay.classList.remove('hidden');
        btnBack.classList.remove('hidden');
        elTitle.textContent = `Detalle: ${selectedDate.toLocaleDateString('es-CL')}`;
        elCurrentMonth.parentElement.classList.add('hidden'); // Hide month nav in detail
        renderDayList();
    } else if (viewName === 'cabin') {
        viewCabin.classList.remove('hidden');
        btnBack.classList.remove('hidden');
        elTitle.textContent = `Detalle: ${selectedDate.toLocaleDateString('es-CL')}`;
        elCurrentMonth.parentElement.classList.add('hidden');
        renderCabinTasks();
    }
}

// --- DATA LOGIC ---

async function loadMonthData() {
    // Update Header
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    elCurrentMonth.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

    // Calculate start/end of month
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

    if (unsubscribeExecuted) unsubscribeExecuted();

    // 1. Fetch Reservations (Buffer for check-ins/outs crossing month)
    const startRes = new Date(startOfMonth); startRes.setDate(startRes.getDate() - 10);
    const endRes = new Date(endOfMonth); endRes.setDate(endRes.getDate() + 10);

    const qRes = query(
        collection(db, "reservas"),
        where("checkIn", ">=", Timestamp.fromDate(startRes)),
        where("checkIn", "<=", Timestamp.fromDate(endRes))
    );

    try {
        const snapRes = await getDocs(qRes);
        reservationsCache = snapRes.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("Error fetching reservations:", e);
        reservationsCache = [];
    }

    // 2. Listen to PlanAseo (Executed)
    const qTasks = query(
        collection(db, "planAseo"),
        where("fecha", ">=", Timestamp.fromDate(startOfMonth)),
        where("fecha", "<=", Timestamp.fromDate(endOfMonth))
    );

    unsubscribeExecuted = onSnapshot(qTasks, (snapshot) => {
        executedCache = [];
        snapshot.forEach(doc => {
            executedCache.push({ id: doc.id, ...doc.data() });
        });

        recalculateComparison();
        renderCalendarGrid();
    }, (error) => {
        renderCalendarGrid();
        console.error("Error loading tasks:", error);
    });
}

function recalculateComparison() {
    combinedTasksCache = [];

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // B. Add Actual Tasks First
    executedCache.forEach(t => {
        combinedTasksCache.push(t);
    });

    // A. Generate Expected Tasks where missing
    console.log(`[DEBUG] Recalculating. Reservations: ${reservationsCache.length}, Executed: ${executedCache.length}`);

    for (let d = 1; d <= daysInMonth; d++) {
        const loopDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
        loopDate.setHours(0, 0, 0, 0);

        reservationsCache.forEach(res => {
            // Check In/Out collision
            const checkIn = res.checkIn.toDate ? res.checkIn.toDate() : new Date(res.checkIn);
            const checkOut = res.checkOut.toDate ? res.checkOut.toDate() : new Date(res.checkOut);

            // Normalize dates for comparison (Strip time)
            const ci = new Date(checkIn); ci.setHours(0, 0, 0, 0);
            const co = new Date(checkOut); co.setHours(0, 0, 0, 0);

            let expectedType = null;
            if (loopDate.getTime() === co.getTime()) {
                expectedType = 'Salida';
            } else if (loopDate.getTime() === ci.getTime()) {
                // Check-in logic if needed
            }

            if (expectedType) {
                // Check if exists in Executed
                // Matches if Same Date, Same Cabin, and (Same Type OR Type is Cambio which covers Salida)
                const exists = executedCache.find(t => {
                    const tDate = t.fecha.toDate ? t.fecha.toDate() : new Date(t.fecha);
                    tDate.setHours(0, 0, 0, 0);
                    return tDate.getTime() === loopDate.getTime() &&
                        t.cabanaId === res.cabanaId &&
                        (t.tipoAseo === expectedType || t.tipoAseo === 'Cambio');
                });

                if (!exists) {
                    // Determine Status
                    let status = 'FALTANTE';
                    if (loopDate.getTime() > today.getTime()) {
                        status = 'PROGRAMADO';
                    } else if (loopDate.getTime() === today.getTime()) {
                        status = 'PENDIENTE';
                    }

                    console.log(`[DEBUG] Ghost Created: ${res.cabanaId} ${loopDate.getDate()} Status: ${status}`);

                    // Push Ghost
                    combinedTasksCache.push({
                        id: `ghost_${res.id}_${d}`,
                        fecha: Timestamp.fromDate(loopDate),
                        cabanaId: res.cabanaId,
                        tipoAseo: expectedType,
                        estado: status,
                        trabajadorNombre: 'No Asignado',
                        isGhost: true
                    });
                }
            }
        });
    }
}

// --- RENDER GRID ---

function renderCalendarGrid() {
    gridCalendar.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay; i++) gridCalendar.appendChild(document.createElement('div'));

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        dateObj.setHours(0, 0, 0, 0);

        const tasks = combinedTasksCache.filter(t => isSameDay(t.fecha.toDate(), dateObj));

        let statusIcon = '';
        let statusClass = 'bg-gray-50 border-gray-200';

        if (tasks.length > 0) {
            const missing = tasks.some(t => t.estado === 'FALTANTE');
            const pending = tasks.some(t => t.estado === 'PENDIENTE');
            // future implicitly handled

            if (missing) {
                statusIcon = '⚠️';
                statusClass = 'bg-red-100 border-red-300 hover:bg-red-200 cursor-pointer';
            } else if (pending) {
                statusIcon = '⏳';
                statusClass = 'bg-orange-50 border-orange-200 hover:bg-orange-100 cursor-pointer';
            } else if (dateObj > today) {
                statusIcon = '📅';
                statusClass = 'bg-blue-50 border-blue-200 hover:bg-blue-100 cursor-pointer';
            } else {
                statusIcon = '✅';
                statusClass = 'bg-green-50 border-green-200 hover:bg-green-100 cursor-pointer';
            }
        }

        const cell = document.createElement('div');
        cell.className = `p-2 h-24 rounded border flex flex-col justify-between transition ${statusClass}`;
        cell.innerHTML = `
            <span class="text-xs font-bold text-gray-500">${day}</span>
            <div class="self-center text-2xl">${statusIcon}</div>
        `;

        if (tasks.length > 0) {
            cell.addEventListener('click', () => {
                selectedDate = dateObj;
                showView('day');
            });
        }
        gridCalendar.appendChild(cell);
    }
}

// --- RENDER DAY LIST ---

function renderDayList() {
    listDay.innerHTML = '';
    const dayTasks = combinedTasksCache.filter(t => isSameDay(t.fecha.toDate(), selectedDate));
    const cabins = {};

    dayTasks.forEach(t => {
        if (!cabins[t.cabanaId]) {
            cabins[t.cabanaId] = {
                name: t.cabanaId,
                worker: t.trabajadorNombre || 'Sin asignar',
                tasks: []
            };
        }
        cabins[t.cabanaId].tasks.push(t);
    });

    Object.values(cabins).forEach(c => {
        const hasMissing = c.tasks.some(t => t.estado === 'FALTANTE');
        const hasPending = c.tasks.some(t => t.estado === 'PENDIENTE');
        const hasFuture = c.tasks.some(t => t.estado === 'PROGRAMADO');

        // Default (All Done)
        let icon = '✅';
        let colorClass = 'text-green-600';
        let statusText = 'Completo';

        if (hasMissing) {
            icon = '⚠️';
            colorClass = 'text-red-600';
            statusText = 'Faltante';
        } else if (hasPending) {
            icon = '⏳';
            colorClass = 'text-orange-600';
            statusText = 'En Progreso';
        } else if (hasFuture) {
            icon = '📅';
            colorClass = 'text-blue-600';
            statusText = 'Programado';
        }

        const workerDisplay = (hasMissing || hasFuture) && c.worker === 'Sin asignar' ? 'Sistema (Automático)' : c.worker;

        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm hover:shadow-md cursor-pointer transition';
        div.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">
                    ${icon}
                </div>
                <div>
                    <h5 class="font-bold text-gray-900">${c.name}</h5>
                    <p class="text-sm text-gray-500">${workerDisplay}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="text-sm font-semibold ${colorClass}">${statusText}</p>
                <p class="text-xs text-gray-400">${c.tasks.length} Tareas</p>
            </div>
        `;
        div.addEventListener('click', () => {
            selectedCabin = c;
            showView('cabin');
        });
        listDay.appendChild(div);
    });
}

// --- RENDER CABIN TASKS ---

function renderCabinTasks() {
    listTasks.innerHTML = '';
    if (!selectedCabin) return;

    detailCabinName.textContent = selectedCabin.name;
    detailWorker.textContent = `Trabajador: ${selectedCabin.worker}`;

    selectedCabin.tasks.forEach(t => {
        const isDone = t.estado === 'FINALIZADO';
        const isMissing = t.estado === 'FALTANTE';
        const isFuture = t.estado === 'PROGRAMADO';
        const isPending = t.estado === 'PENDIENTE';

        let statusColor = 'text-gray-600 bg-gray-100';
        let icon = '⬜';

        if (isDone) {
            statusColor = 'text-green-600 font-bold bg-green-50';
            icon = '☑️';
        } else if (isMissing) {
            statusColor = 'text-red-600 font-bold bg-red-50 border border-red-200';
            icon = '⚠️';
        } else if (isFuture) {
            statusColor = 'text-blue-600 font-bold bg-blue-50';
            icon = '📅';
        } else if (isPending) {
            statusColor = 'text-orange-600 font-bold bg-orange-50';
            icon = '⏳';
        } else {
            // Fallback for weird status
            statusColor = 'text-gray-500 bg-gray-100';
            icon = '❓';
        }

        let timeStart = '-';
        let timeEnd = '-';
        if (t.startTime) timeStart = t.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (t.completedAt) timeEnd = t.completedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                <span>${icon}</span> ${t.tipoAseo}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span class="px-2 py-1 rounded ${statusColor}">${t.estado || 'Indefinido'}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${timeStart}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${timeEnd}</td>
        `;
        listTasks.appendChild(row);
    });
}

// Helper
function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}
