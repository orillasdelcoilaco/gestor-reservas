// backend/frontend/js/modules/activityAdmin.js
import { db } from '../firebase-init.js';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

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
let tasksCache = []; // Store fetched tasks for the month
let unsubscribe = null;

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
    if (unsubscribe) unsubscribe();
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

function loadMonthData() {
    // Update Header
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    elCurrentMonth.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

    // Calculate start/end of month
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

    if (unsubscribe) unsubscribe();

    // Fetch ALL tasks for the month (optimized)
    // In a huge app, we might fetch only stats, but for this scale, fetching tasks is fine
    const q = query(
        collection(db, "planAseo"),
        //orderBy("fecha"), // Optional: requires index
        where("fecha", ">=", Timestamp.fromDate(startOfMonth)),
        where("fecha", "<=", Timestamp.fromDate(endOfMonth))
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        tasksCache = [];
        snapshot.forEach(doc => {
            tasksCache.push({ id: doc.id, ...doc.data() });
        });
        renderCalendarGrid();
    }, (error) => {
        console.error("Error loading tasks:", error);
        // Fallback for missing index: render empty or mock if needed
        renderCalendarGrid();
    });
}

// --- RENDER CALENDAR ---

function renderCalendarGrid() {
    gridCalendar.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty cells for first week offset
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        gridCalendar.appendChild(div);
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dayTasks = tasksCache.filter(t => isSameDay(t.fecha.toDate(), dateObj));

        // Status Logic
        let statusIcon = '';
        let statusClass = 'bg-gray-50 border-gray-200';

        if (dayTasks.length > 0) {
            const allDone = dayTasks.every(t => t.estado === 'FINALIZADO');
            const hasPending = dayTasks.some(t => t.estado === 'PENDIENTE');
            // Check issues? Assuming estado != FINALIZADO && date < now is issue?
            // Simple logic:
            if (allDone) {
                statusIcon = '✅';
                statusClass = 'bg-green-50 border-green-200 hover:bg-green-100 cursor-pointer';
            } else if (hasPending) {
                // Check if date is in past
                const isPast = dateObj < new Date(new Date().setHours(0, 0, 0, 0));
                if (isPast) {
                    statusIcon = '❌';
                    statusClass = 'bg-red-50 border-red-200 hover:bg-red-100 cursor-pointer';
                } else {
                    statusIcon = '⏳';
                    statusClass = 'bg-orange-50 border-orange-200 hover:bg-orange-100 cursor-pointer';
                }
            }
        } // Else empty day

        const cell = document.createElement('div');
        cell.className = `p-2 h-24 rounded border flex flex-col justify-between transition ${statusClass}`;
        cell.innerHTML = `
            <span class="text-xs font-bold text-gray-500">${day}</span>
            <div class="self-center text-2xl">${statusIcon}</div>
        `;

        if (dayTasks.length > 0) {
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
    // Group tasks by Cabin
    const dayTasks = tasksCache.filter(t => isSameDay(t.fecha.toDate(), selectedDate));
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
        // Cabin Status
        const allDone = c.tasks.every(t => t.estado === 'FINALIZADO');
        const icon = allDone ? '✅' : '⏳';
        const colorClass = allDone ? 'text-green-600' : 'text-orange-600';

        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm hover:shadow-md cursor-pointer transition';
        div.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">
                    ${icon}
                </div>
                <div>
                    <h5 class="font-bold text-gray-900">${c.name}</h5>
                    <p class="text-sm text-gray-500">${c.worker}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="text-sm font-semibold ${colorClass}">${allDone ? 'Completado' : 'En Progreso'}</p>
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
        const statusColor = isDone ? 'text-green-600 font-bold bg-green-50' : 'text-yellow-600 bg-yellow-50';

        let timeStart = '-';
        let timeEnd = '-';

        // Assuming timestamp fields exist or will exist. 
        // For now using placeholder or existing fields if any.
        // t.fecha is plan date. t.completedAt is finish.
        if (t.startTime) timeStart = t.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (t.completedAt) timeEnd = t.completedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-2">
                <span>${isDone ? '☑️' : '⬜'}</span> ${t.tipoAseo}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span class="px-2 py-1 rounded ${statusColor}">${t.estado}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${timeStart}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${timeEnd}</td>
        `;

        // Click to view details/checklist if we had it
        // row.addEventListener('click', ...)

        listTasks.appendChild(row);
    });
}

// Helper
function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}
