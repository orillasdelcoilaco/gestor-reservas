// backend/frontend/js/modules/historyViewer.js
import { fetchAPI } from '../../api.js';

const ESPACIOS = [
    'Dormitorio Principal', 'Dormitorio', 'Baño en Suite', 'Baño',
    'Living', 'Comedor', 'Cocina', 'Terraza', 'Quincho', 'Exterior'
];

export function initHistoryViewer() {
    const btnLoad = document.getElementById('btn-load-history');
    if (!btnLoad) return;

    // Populate Spaces
    const selSpace = document.getElementById('hist_space');
    ESPACIOS.forEach(s => {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = s;
        selSpace.appendChild(o);
    });

    // Default Dates (Last 7 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);

    document.getElementById('hist_end').valueAsDate = end;
    document.getElementById('hist_start').valueAsDate = start;

    btnLoad.addEventListener('click', loadHistory);

    // PDF Button
    const btnPdf = document.getElementById('btn-download-report');
    if (btnPdf) {
        btnPdf.addEventListener('click', () => {
            const params = new URLSearchParams({
                startDate: document.getElementById('hist_start').value,
                endDate: document.getElementById('hist_end').value,
                cabanaId: document.getElementById('hist_cabana').value
                // Space filter often ignored in PDF report for general summary, but could be passed.
                // Our reportController accepts startDate, endDate, cabanaId.
            });
            // Open in new tab to trigger download
            // Note: If using fetchAPI for auth, we might need a Blob strategy.
            // But usually for download, window.open with token in param or cookie is easier.
            // Since fetchAPI handles headers, let's use a fetch-blob approach to support Auth Header.
            downloadPdf(params);
        });
    }
}

async function downloadPdf(params) {
    const btn = document.getElementById('btn-download-report');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Generando...';
    btn.disabled = true;

    try {
        const response = await fetchAPI(`/api/reportes/descargar?${params.toString()}`, {
            // fetchAPI already handles JSON parsing if not blob? 
            // We need to verify fetchAPI implementation.
            // fetchAPI parses JSON automatically: "return await response.json();"
            // We need to bypass JSON parsing for Blob.
            // api.js fetchAPI logic: "if (response.status === 204) ... return await response.json();"

            // Check api.js:
            // "if (!response.ok) ... throw ... return await response.json();"
            // It ALWAYS tries to parse JSON at the end.
            // I should either modify fetchAPI or use raw fetch here with getToken.
        });

        // Wait, fetchAPI is imported from api.js. 
        // If api.js forces JSON return, I can't use it for Blob.
        // Let's check api.js content again.
        // Step 3293: 
        // "return await response.json();" is at line 44.

        // So I must export a helper or manually fetch.
        // I will manually fetch here to avoid changing core api.js for now.

        const token = localStorage.getItem('firebaseIdToken');
        const res = await fetch(`/api/reportes/descargar?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Error descargando reporte');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "Reporte_Cabin_Health.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();

    } catch (e) {
        console.error(e);
        alert('Error descargando PDF: ' + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function loadHistory() {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Cargando...</td></tr>';

    const params = new URLSearchParams({
        startDate: document.getElementById('hist_start').value,
        endDate: document.getElementById('hist_end').value,
        cabanaId: document.getElementById('hist_cabana').value,
        espacio: document.getElementById('hist_space').value
    });

    try {
        const events = await fetchAPI(`/api/historial?${params.toString()}`);
        renderTable(events);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Error: ${e.message}</td></tr>`;
    }
}

function renderTable(events) {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';

    if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No se encontraron eventos en este periodo.</td></tr>';
        return;
    }

    events.forEach(ev => {
        const tr = document.createElement('tr');

        let typeBadge = '';
        if (ev.type === 'TAREA') typeBadge = '<span class="text-xl">🧹</span>';
        else if (ev.type === 'INCIDENCIA') typeBadge = '<span class="text-xl">⚠️</span>';

        let statusBadge = '';
        if (ev.type === 'TAREA') statusBadge = '<span class="px-2 py-1 text-xs font-bold rounded bg-blue-100 text-blue-800">COMPLETADA</span>';
        else {
            if (ev.subType === 'PENDIENTE') statusBadge = '<span class="px-2 py-1 text-xs font-bold rounded bg-red-100 text-red-800">PENDIENTE</span>';
            else statusBadge = '<span class="px-2 py-1 text-xs font-bold rounded bg-green-100 text-green-800">RESUELTA</span>';
        }

        const dateStr = new Date(ev.date).toLocaleString('es-CL');

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${dateStr}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">${typeBadge}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                ${ev.cabanaId}
                ${ev.espacio ? `<br><span class="text-gray-500 font-normal text-xs">${ev.espacio}</span>` : ''}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title="${ev.details}">${ev.details}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 italic">${ev.user}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${statusBadge}</td>
        `;

        tbody.appendChild(tr);
    });
}
