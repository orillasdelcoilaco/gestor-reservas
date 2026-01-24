import { checkSession, fetchAPI } from '../api.js';

// --- State ---
let tinajasData = [];
const CUTOFF_HOUR = 13; // 13:00 PM

// --- Elements ---
const loader = document.getElementById('loader');
const appContent = document.getElementById('app-content');
const tableBody = document.getElementById('tinajas-table-body');
const emptyState = document.getElementById('empty-state');
const fechaEl = document.getElementById('fecha-actual');
const horaEl = document.getElementById('hora-actual');
const btnReporte = document.getElementById('btn-reporte-final');

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    const session = checkSession();
    if (!session) return;

    // Setup UI
    const today = new Date();
    fechaEl.textContent = today.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Start Clock for Alerts
    setInterval(updateClockAndAlerts, 1000);
    updateClockAndAlerts();

    // Load Data
    await loadTinajasData();

    // Show App
    loader.classList.add('hidden');
    appContent.classList.remove('hidden');

    // Bind Global Events
    btnReporte.addEventListener('click', generateFinalReport);

    // --- Encargado Persistence (LocalStorage) ---
    const inputNombre = document.getElementById('encargado-nombre');
    const inputFono = document.getElementById('encargado-fono');

    // Load saved data
    if (localStorage.getItem('encargado_nombre')) inputNombre.value = localStorage.getItem('encargado_nombre');
    if (localStorage.getItem('encargado_fono')) inputFono.value = localStorage.getItem('encargado_fono');

    // Save on change
    inputNombre.addEventListener('input', (e) => localStorage.setItem('encargado_nombre', e.target.value));
    inputFono.addEventListener('input', (e) => localStorage.setItem('encargado_fono', e.target.value));
});

async function loadTinajasData() {
    try {
        tinajasData = await fetchAPI('/api/tinajas/diarias'); // Endpoint to be created
        renderTable();
    } catch (error) {
        console.error('Error loading tinajas:', error);
        tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-600">Error al cargar datos: ${error.message}</td></tr>`;
    }
}

function renderTable() {
    tableBody.innerHTML = '';

    if (!tinajasData || tinajasData.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    tinajasData.sort((a, b) => {
        // Sort criteria: Obligatorias first, then by cabin name
        if (a.limpiezaObligatoria && !b.limpiezaObligatoria) return -1;
        if (!a.limpiezaObligatoria && b.limpiezaObligatoria) return 1;
        return a.cabana.localeCompare(b.cabana, undefined, { numeric: true });
    });

    tinajasData.forEach(tinaja => {
        const tr = document.createElement('tr');
        tr.id = `row-${tinaja.id}`;
        tr.dataset.enviado = tinaja.enviado;

        // --- Logic: Limpieza ---
        let limpiezaHtml = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">Estándar</span>`;
        if (tinaja.limpiezaObligatoria) {
            limpiezaHtml = `<span class="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800">⚠️ OBLIGATORIA (CAMBIO)</span>`;
            tr.classList.add('bg-red-50'); // Highlight row
        }

        // --- Logic: WhatsApp Link ---
        // Msg: Hola [CLIENTE], vas a usar la tinaja hoy, avísame antes de la 14:00 para alcanzar a prenderla, gracias.
        const phone = tinaja.telefono ? tinaja.telefono.replace(/\D/g, '') : '';
        const msg = `Hola ${tinaja.clienteNombre.split(' ')[0]}, vas a usar la tinaja hoy, avísame antes de la 14:00 para alcanzar a prenderla, gracias.`;
        const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : '#';
        const btnClass = phone ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed';

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${tinaja.cabana}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                <div class="font-bold">${tinaja.clienteNombre}</div>
                <div class="text-xs text-gray-400">${tinaja.reservaId}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${limpiezaHtml}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <a href="${waLink}" target="_blank" class="${btnClass} px-3 py-1.5 rounded text-xs font-bold shadow transition flex items-center justify-center gap-1 mx-auto w-24">
                    <span>💬</span> Consultar
                </a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <input type="checkbox" class="h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 envio-check" 
                    ${tinaja.enviado ? 'checked' : ''} data-id="${tinaja.id}">
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                 <div class="flex items-center justify-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" value="" class="sr-only peer respuesta-toggle" ${tinaja.respuestaSi ? 'checked' : ''} data-id="${tinaja.id}">
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        <span class="ml-2 text-sm font-medium text-gray-700">${tinaja.respuestaSi ? 'SÍ' : 'NO'}</span>
                    </label>
                </div>
            </td>
        `;

        // Bind events locally for this row
        const check = tr.querySelector('.envio-check');
        check.addEventListener('change', (e) => updateLocalStatus(tinaja.id, 'enviado', e.target.checked));

        const toggle = tr.querySelector('.respuesta-toggle');
        toggle.addEventListener('change', (e) => {
            updateLocalStatus(tinaja.id, 'respuestaSi', e.target.checked);
            // Update text label visual
            e.target.parentNode.querySelector('span').textContent = e.target.checked ? 'SÍ' : 'NO';
        });

        tableBody.appendChild(tr);
    });

    // Check Alerts immediately after render
    updateClockAndAlerts();
}

async function updateLocalStatus(id, field, value) {
    // Optimistic Update
    const item = tinajasData.find(t => t.id === id);
    if (item) item[field] = value;

    // Re-check alerts visually
    updateClockAndAlerts();

    // Persist
    try {
        await fetchAPI('/api/tinajas/update', { // Endpoint to be created
            method: 'POST',
            body: { id, field, value }
        });
    } catch (error) {
        console.error('Failed to persist status:', error);
        // Provide visual feedback of failure if needed
    }
}

function updateClockAndAlerts() {
    const now = new Date();
    const hours = now.getHours();
    const mins = now.getMinutes().toString().padStart(2, '0');
    horaEl.textContent = `${hours}:${mins}`;

    // Alert Logic: Time > 13:00 AND Checkbox "Enviado" is unchecked
    const isLate = hours >= CUTOFF_HOUR;

    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const id = row.id.replace('row-', '');
        const item = tinajasData.find(t => t.id === id);
        if (!item) return;

        if (isLate && !item.enviado) {
            row.classList.add('bg-red-200', 'animate-pulse'); // More aggressive red
            row.style.boxShadow = "inset 0 0 10px rgba(255,0,0,0.2)";
        } else {
            row.classList.remove('bg-red-200', 'animate-pulse');
            row.style.boxShadow = "none";
            // Restore original background if needed (obligatoria check)
            if (item.limpiezaObligatoria) {
                row.classList.add('bg-red-50');
            } else {
                row.classList.remove('bg-red-50');
            }
        }
    });
}

function generateFinalReport() {
    // Tinajas hoy [FECHA]
    // Limpieza: Cabaña 1 (cambio), Cabaña 10 (cambio)...
    // Tinajas a prender: Cabaña 1, Cabaña 2...

    const todayStr = new Date().toLocaleDateString('es-CL');
    let report = `*Tinajas hoy ${todayStr}*\n\n`;

    // 1. Limpiezas (Solo las obligatorias)
    const limpiezas = tinajasData.filter(t => t.limpiezaObligatoria).map(t => `${t.cabana} (cambio)`);
    if (limpiezas.length > 0) {
        report += `*Limpieza:* ${limpiezas.join(', ')}\n`;
    } else {
        report += `*Limpieza:* Ninguna obligatoria\n`;
    }

    // 2. Tinajas a Prender (Solo las que tienen "Respuesta SÍ")
    const aPrender = tinajasData.filter(t => t.respuestaSi).map(t => t.cabana);
    if (aPrender.length > 0) {
        report += `*Tinajas a prender:* ${aPrender.join(', ')}`;
    } else {
        report += `*Tinajas a prender:* Ninguna`;
    }

    // Get Encargado Phone
    const encargadoFono = document.getElementById('encargado-fono').value.replace(/\D/g, '');
    const validPhone = encargadoFono.length >= 8 ? encargadoFono : '';

    // Open WhatsApp Web/API
    const waLink = `https://wa.me/${validPhone}?text=${encodeURIComponent(report)}`;
    window.open(waLink, '_blank');
}
