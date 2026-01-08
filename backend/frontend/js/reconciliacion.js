import { checkSession, logout, fetchAPI } from '../api.js';

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-upload');
const fileInfo = document.getElementById('file-info');
const fileNameDisplay = document.getElementById('file-name');
const analyzeBtn = document.getElementById('analyze-btn');
const analyzeSpinner = document.getElementById('analyze-spinner');
const errorMessage = document.getElementById('error-message');
const summarySection = document.getElementById('summary-section');
const resultsSection = document.getElementById('results-section');
const resultsBody = document.getElementById('results-body');
const authInfo = document.getElementById('auth-info');
// History Elements
const historyBtn = document.getElementById('history-btn');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const closeHistoryBtn = document.getElementById('close-history');
const historyBackdrop = document.getElementById('history-backdrop');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statMismatch = document.getElementById('stat-mismatch');
const statAmountUSD = document.getElementById('stat-amount-usd');
const statCommission = document.getElementById('stat-commission');

// ... exist code ...

// History Logic
historyBtn.addEventListener('click', loadHistory);
closeHistoryBtn.addEventListener('click', () => historyPanel.classList.add('hidden'));
historyBackdrop.addEventListener('click', () => historyPanel.classList.add('hidden'));

async function loadHistory() {
    historyPanel.classList.remove('hidden');
    historyList.innerHTML = '<p class="text-gray-500 text-sm text-center">Cargando...</p>';

    try {
        const history = await fetchAPI('/api/reconciliacion/history'); // fetchAPI maneja auth y 401

        if (!history || history.length === 0) {
            historyList.innerHTML = '<p class="text-gray-500 text-sm text-center">No hay reportes guardados.</p>';
            return;
        }

        const historyHtml = history.map(item => {
            const date = new Date(item.metadata.date._seconds * 1000).toLocaleString();
            return `
                <div class="p-3 bg-gray-50 rounded hover:bg-indigo-50 transition flex justify-between items-center history-item group" data-id="${item.id}">
                    <div class="cursor-pointer flex-grow" onclick="loadHistoricalReport('${item.id}')">
                        <p class="font-medium text-gray-800 text-sm">${item.metadata.filename || 'Reporte sin nombre'}</p>
                        <p class="text-xs text-gray-500">${date}</p>
                    </div>
                    <div class="flex items-center space-x-3">
                        <div class="text-right text-xs cursor-pointer" onclick="loadHistoricalReport('${item.id}')">
                            <p class="font-bold ${item.summary.totalDiscrepancies > 0 ? 'text-red-600' : 'text-green-600'}">
                                ${item.summary.totalDiscrepancies} Discrepancias
                            </p>
                        </div>
                        <button class="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition delete-report-btn" data-id="${item.id}" title="Eliminar Reporte">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        historyList.innerHTML = historyHtml;

        // Event listeners are simpler now because onclick is used for loading
        document.querySelectorAll('.delete-report-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent loading the report when clicking delete
                deleteReportHandler(btn.dataset.id);
            });
        });

    } catch (error) {
        historyList.innerHTML = `<p class="text-red-500 text-sm">Error: ${error.message}</p>`;
    }
}

async function loadHistoricalReport(id) {
    historyPanel.classList.add('hidden');
    // Mostrar loading en la tabla principal
    resultsSection.classList.add('hidden');
    analyzeSpinner.classList.remove('hidden'); // Reutilizamos spinner botón (hacky ma non troppo)

    try {
        const report = await fetchAPI(`/api/reconciliacion/history/${id}`);

        fileInfo.classList.remove('hidden');
        fileNameDisplay.textContent = `HISTÓRICO: ${report.metadata.filename} (${new Date(report.metadata.date._seconds * 1000).toLocaleString()})`;

        renderResults(report); // Reutilizamos la función de renderizado principal

    } catch (error) {
        errorMessage.textContent = "Error al cargar reporte histórico: " + error.message;
        errorMessage.classList.remove('hidden');
    } finally {
        analyzeSpinner.classList.add('hidden');
    }
}

async function deleteReportHandler(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este reporte?')) return;

    try {
        await fetchAPI(`/api/reconciliacion/history/${id}`, { method: 'DELETE' });
        loadHistory(); // Reload list
    } catch (error) {
        alert('Error al eliminar el reporte: ' + error.message);
    }
}


let selectedFile = null;

// Auth Check
const session = checkSession();
if (session && authInfo) {
    authInfo.innerHTML = `<span class="text-sm text-gray-600 hidden sm:block">${session.userEmail}</span><button id="logout-btn" class="px-3 py-2 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700">Cerrar Sesión</button>`;
    document.getElementById('logout-btn').addEventListener('click', logout);
}

// Drag & Drop Logic
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-active');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    if (e.dataTransfer.files.length) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    selectedFile = file;
    fileNameDisplay.textContent = file.name;
    fileInfo.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    resetResults();
}

function resetResults() {
    summarySection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    resultsBody.innerHTML = '';
}

analyzeBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    analyzeBtn.disabled = true;
    analyzeSpinner.classList.remove('hidden');
    errorMessage.classList.add('hidden');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const data = await fetchAPI('/api/reconciliacion/analyze', {
            method: 'POST',
            body: formData
        });

        // fetchAPI ya devuelve el JSON o lanza error
        renderResults(data.data);

    } catch (error) {
        console.error(error);
        errorMessage.textContent = error.message;
        errorMessage.classList.remove('hidden');
    } finally {
        analyzeBtn.disabled = false;
        analyzeSpinner.classList.add('hidden');
    }
});

function formatCurrency(value, currency = 'USD') {
    if (value === undefined || value === null) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(value);
}

function renderResults(data) {
    const { summary, details } = data;

    // Render Summary
    statTotal.textContent = summary.totalRows;
    statMismatch.textContent = summary.totalDiscrepancies;
    statAmountUSD.textContent = formatCurrency(summary.totalBookingUSD, 'USD');
    statCommission.textContent = formatCurrency(summary.totalCommissionUSD, 'USD');

    summarySection.classList.remove('hidden');

    // Render Table
    resultsBody.innerHTML = details.map(row => {
        const isMismatch = row.matchStatus !== 'MATCH';
        const bgClass = isMismatch ? 'bg-red-50' : '';
        const statusClass = isMismatch ? 'text-red-600 font-bold' : 'text-green-600';

        const discrepanciesHtml = row.discrepancies.length
            ? `<ul class="list-disc list-inside text-xs text-red-600">${row.discrepancies.map(d => `<li>${d}</li>`).join('')}</ul>`
            : '<span class="text-green-500 text-xs">✔ Coincide</span>';

        // Internal Amount Display
        let internalAmountHtml = '-';
        if (row.internalData) {
            internalAmountHtml = `
                <div class="text-xs">
                    <div>CLP: ${row.internalData.totalCLP ? formatCurrency(row.internalData.totalCLP, 'CLP') : '0'}</div>
                    <div class="text-gray-500">USD: ${row.internalData.totalUSD ? formatCurrency(row.internalData.totalUSD, 'USD') : 'Calc'}</div>
                    ${row.internalData.valorDolarDia ? `<div class="text-gray-400 text-[10px]">T.C.: ${row.internalData.valorDolarDia}</div>` : ''}
                </div>
            `;
        }

        return `
            <tr class="${bgClass} hover:bg-gray-100 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${row.reservationId}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div class="font-bold">${row.guestName}</div>
                    <div class="text-xs">${row.dates}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <div class="${statusClass}">BKG: ${row.bookingData.status}</div>
                    <div class="text-xs text-gray-600">INT: ${row.internalData ? row.internalData.status : 'NO ENCONTRADA'}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                    ${row.bookingData.status === 'CANCELLED' && row.bookingData.originalAmount > 0
                ? `<span class="text-gray-400 line-through text-xs mr-1">${formatCurrency(row.bookingData.amount, row.bookingData.currency)}</span> ${formatCurrency(row.bookingData.originalAmount, row.bookingData.currency)} <span class="text-xs font-normal text-gray-500">(Ref)</span>`
                : formatCurrency(row.bookingData.amount, row.bookingData.currency)
            }
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${internalAmountHtml}
                </td>
                <td class="px-6 py-4 text-sm">
                    ${discrepanciesHtml}
                </td>
            </tr>
        `;
    }).join('');

    resultsSection.classList.remove('hidden');
}
