import { fetchAPI } from './api.js';

// --- Variables y referencias que serán pasadas desde gestion.html ---
let currentGrupo = null;
let currentAction = null;
let allTransacciones = [];
let modalContent, modal, gestionUI;

// --- Función de Inicialización ---
// Esta función conecta este módulo con los elementos y el estado de gestion.html
export function initializeHelpers(uiRefs) {
    modalContent = uiRefs.modalContent;
    modal = uiRefs.modal;
    gestionUI = uiRefs; // Guardamos todas las referencias
}

// --- Funciones para manejar el estado que se pasa desde gestion.html ---
export function setCurrentGrupo(grupo) {
    currentGrupo = grupo;
}
export function setAllTransacciones(transacciones) {
    allTransacciones = transacciones;
}

// --- Helpers de Formato ---
function formatCurrency(value) { return `$${(value || 0).toLocaleString('es-CL')}`; }
function formatDate(dateString) { return dateString ? new Date(dateString).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : 'N/A'; }

// --- Lógica de Renderizado de Modales ---

export function renderAjusteTarifaModal() {
    modalContent.innerHTML = `
        <div class="border-b border-gray-200">
            <nav id="modal-tabs" class="-mb-px flex space-x-6" aria-label="Tabs">
                <button data-tab="kpi" class="modal-tab whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm border-indigo-500 text-indigo-600">Calcular Potencial (KPI)</button>
                <button data-tab="ajuste" class="modal-tab whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">Ajustar Cobro</button>
                ${currentGrupo.reservasIndividuales.length > 1 ? `<button data-tab="distribuir" class="modal-tab whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">Distribuir Valores</button>` : ''}
            </nav>
        </div>
        <div id="modal-tab-content" class="mt-5"></div>
    `;
    const tabs = modalContent.querySelectorAll('.modal-tab');
    tabs.forEach(tab => tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.replace('border-indigo-500', 'border-transparent'));
        tab.classList.replace('border-transparent', 'border-indigo-500');
        renderTabContent(tab.dataset.tab);
    }));
    renderTabContent('kpi');
}

function renderTabContent(tabName) {
    const contentContainer = document.getElementById('modal-tab-content');
    const valorActualTotal = currentGrupo.valorCLP;

    switch(tabName) {
        case 'kpi':
            const potencialGuardadoHtml = currentGrupo.potencialCalculado 
                ? `<div class="p-3 bg-blue-50 border border-blue-200 rounded-md"><p class="text-sm font-semibold text-blue-800">Valor Potencial Guardado: ${formatCurrency(currentGrupo.valorPotencialTotal)}</p></div>` 
                : '';
            contentContainer.innerHTML = `
                <p class="text-sm text-gray-600 mb-3">Calcula el precio de lista basado en el valor de cobro actual y un descuento.</p>
                ${potencialGuardadoHtml}
                <div class="space-y-4 mt-4">
                    <div><label for="descuento-pct" class="block text-sm font-medium text-gray-700">Porcentaje de Descuento (%)</label><input type="number" id="descuento-pct" placeholder="Ej: 15" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm"></div>
                    <div><p class="text-sm">Valor de Cobro Actual: <span class="font-semibold">${formatCurrency(valorActualTotal)}</span></p><p class="text-sm">Valor Potencial a Calcular: <span id="valor-potencial-preview" class="font-semibold text-blue-600"></span></p></div>
                    <div id="kpi-status" class="text-sm"></div>
                    <div class="text-right"><button id="kpi-save-btn" class="px-6 py-2 bg-blue-600 text-white rounded-md">Calcular y Guardar</button></div>
                </div>`;
            const descuentoInput = contentContainer.querySelector('#descuento-pct');
            descuentoInput.addEventListener('input', () => {
                const pct = parseFloat(descuentoInput.value);
                contentContainer.querySelector('#valor-potencial-preview').textContent = (pct > 0 && pct < 100) ? formatCurrency(Math.round(valorActualTotal / (1 - (pct / 100)))) : '';
            });
            contentContainer.querySelector('#kpi-save-btn').addEventListener('click', handleSaveKpi);
            break;
        case 'ajuste':
            contentContainer.innerHTML = `
                <p class="text-sm text-gray-600 mb-3">Modifica el monto final que se cobrará al cliente.</p>
                <div class="space-y-4">
                    <div><label for="nuevo-valor-final" class="block text-sm font-medium text-gray-700">Nuevo Valor Final a Cobrar (CLP)</label><input type="number" id="nuevo-valor-final" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" value="${valorActualTotal}"></div>
                    <p class="text-sm">Valor Original: <span class="font-semibold">${formatCurrency(valorActualTotal)}</span></p>
                    <div id="ajuste-status" class="text-sm"></div>
                    <div class="text-right"><button id="ajuste-save-btn" class="px-6 py-2 bg-red-600 text-white rounded-md">Ajustar Monto Final</button></div>
                </div>`;
            contentContainer.querySelector('#ajuste-save-btn').addEventListener('click', handleSaveAjusteFinal);
            break;
        case 'distribuir':
            renderAjusteGrupo();
            break;
    }
}

function renderAjusteGrupo() {
    const contentContainer = document.getElementById('modal-tab-content') || modalContent;
    let cabanasHtml = currentGrupo.reservasIndividuales.map(res => `
        <div class="grid grid-cols-2 gap-4 items-center">
            <label for="valor-${res.id}" class="text-sm font-medium">${res.alojamiento}</label>
            <input type="number" id="valor-${res.id}" data-id="${res.id}" class="valor-input block w-full px-3 py-2 border rounded-md" value="${res.valorCLP}">
        </div>`).join('');
    contentContainer.innerHTML = `
        <div class="space-y-4">
            <p class="text-sm text-gray-600">Corrige la distribución del valor total entre las cabañas del grupo.</p>
            <div class="space-y-2">${cabanasHtml}</div>
            <div class="border-t pt-3 flex justify-between items-center font-bold"><span>TOTAL:</span><span id="ajuste-valores-total"></span></div>
            <div id="ajuste-valores-status" class="text-sm"></div>
            <div class="text-right"><button id="ajuste-valores-save-btn" class="px-6 py-2 bg-indigo-600 text-white rounded-md">Guardar</button></div>
        </div>`;
    contentContainer.querySelectorAll('.valor-input').forEach(input => input.addEventListener('input', updateValoresTotal));
    contentContainer.querySelector('#ajuste-valores-save-btn').addEventListener('click', handleSaveAjusteGrupo);
    updateValoresTotal();
}

export function renderPagosModal() {
    modalContent.innerHTML = `
        <div id="pagos-summary" class="grid grid-cols-3 gap-4 font-semibold text-center w-full mb-4 p-2 bg-gray-50 rounded-md"></div>
        <div id="lista-pagos" class="space-y-2 max-h-48 overflow-y-auto pr-2 border-t border-b py-3">Cargando pagos...</div>
        <div id="pagos-form-container" class="pt-4 mt-4"></div>
        <div class="mt-4"><button id="btn-registrar-nuevo-pago" class="w-full bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700">Registrar Nuevo Pago</button></div>`;
    modalContent.querySelector('#btn-registrar-nuevo-pago').addEventListener('click', () => showActionForm('registrar_pago'));
    renderPagosList();
}

async function renderPagosList() {
    const { listaPagos, pagosSummary } = gestionUI.getPagosElements();
    const ids = currentGrupo.reservasIndividuales.map(r => r.id);
    const transacciones = await fetchAPI('/api/gestion/transacciones-grupo', { method: 'POST', body: { idsIndividuales: ids } });
    setAllTransacciones(transacciones);

    const totalAbonado = allTransacciones.reduce((sum, t) => sum + t.monto, 0);
    const saldo = currentGrupo.valorCLP - totalAbonado;
    pagosSummary.innerHTML = `
        <div><span class="text-gray-500 font-medium">Total:</span> ${formatCurrency(currentGrupo.valorCLP)}</div>
        <div class="text-green-600"><span class="text-gray-500 font-medium">Abonado:</span> ${formatCurrency(totalAbonado)}</div>
        <div class="text-red-600"><span class="text-gray-500 font-medium">Saldo:</span> ${formatCurrency(saldo)}</div>`;
    
    if (allTransacciones.length === 0) {
        listaPagos.innerHTML = '<p class="text-sm text-center text-gray-500 p-4">No hay pagos registrados.</p>';
        return;
    }
    listaPagos.innerHTML = allTransacciones.map(p => `
        <div class="p-2 border rounded-md flex justify-between items-center">
            <div>
                <p class="font-semibold">${formatCurrency(p.monto)} - <span class="font-normal text-gray-600">${p.tipo} (${p.medioDePago})</span></p>
                <p class="text-xs text-gray-500">Fecha: ${formatDate(p.fecha)}</p>
            </div>
            <div class="space-x-2">
                <button data-id="${p.id}" class="edit-pago-btn text-xs text-indigo-600 hover:text-indigo-900">Editar</button>
                <button data-id="${p.id}" data-reserva-id="${p.reservaId}" class="delete-pago-btn text-xs text-red-600 hover:text-red-900">Eliminar</button>
            </div>
        </div>`).join('');
    listaPagos.querySelectorAll('.edit-pago-btn').forEach(btn => btn.addEventListener('click', e => showActionForm('editar_pago', allTransacciones.find(t => t.id === e.target.dataset.id))));
    listaPagos.querySelectorAll('.delete-pago-btn').forEach(btn => btn.addEventListener('click', e => handleDeleteTransaction(e.target.dataset.id, e.target.dataset.reservaId)));
}

export function renderBoletaModal() {
    showActionForm('marcar_boleta_enviada');
}

export function renderGestionReservaModal() {
    showActionForm('gestionar_reserva');
}

function showActionForm(action, transaccion = null) {
    currentAction = action;
    const { pagosFormContainer } = gestionUI.getPagosElements();
    const container = pagosFormContainer || modalContent;

    const montoTotalGrupo = currentGrupo.valorCLP;
    const abonoTotalGrupo = allTransacciones.reduce((sum, t) => sum + t.monto, 0);
    const saldoPendiente = montoTotalGrupo - abonoTotalGrupo;

    container.innerHTML = `
        <form id="modal-form-accion">
            <h4 class="font-semibold text-lg mb-4">${action.includes('pago') ? (transaccion ? 'Editar Pago' : 'Registrar Pago') : (action.includes('boleta') ? 'Subir Boleta/Factura' : 'Subir Imagen de Reserva')}</h4>
            <div class="${action.includes('pago') ? '' : 'hidden'} space-y-4">
                <div><label class="block text-sm">Monto (CLP)</label><input type="number" id="monto-input" required class="mt-1 block w-full rounded-md border-gray-300" value="${transaccion?.monto || saldoPendiente}"></div>
                <div><label class="block text-sm">Medio de Pago</label><select id="medio-pago-select" class="mt-1 block w-full rounded-md border-gray-300"></select></div>
                <div class="flex items-center"><input id="pago-final-checkbox" type="checkbox" class="h-4 w-4 rounded" ${transaccion?.tipo === 'Pago Final' ? 'checked' : ''}><label for="pago-final-checkbox" class="ml-2 text-sm">¿Es el pago final?</label></div>
            </div>
            <div class="mt-4">
                <label class="block text-sm">Documento (Opcional)</label>
                <input type="file" id="documento-input" class="hidden"/>
                <div id="paste-zone" class="paste-zone mt-1 rounded-md"><p class="text-gray-500">Selecciona o pega una imagen</p></div>
                <div id="preview-container" class="mt-2 hidden"><p class="text-sm">Vista Previa:</p><img id="thumbnail" class="w-24 h-24 object-cover rounded-md"></div>
                <div class="flex items-center mt-3"><input id="sin-documento-checkbox" type="checkbox" class="h-4 w-4" ${transaccion?.enlaceComprobante === 'SIN_DOCUMENTO' ? 'checked' : ''}><label for="sin-documento-checkbox" class="ml-2 text-sm">Registrar sin documento</label></div>
            </div>
            <div id="modal-status" class="mt-2 text-sm text-red-600"></div>
            <div class="mt-5 flex justify-end space-x-2">
                <button type="button" id="form-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md">Cancelar</button>
                <button type="submit" id="modal-save-btn" class="px-4 py-2 bg-indigo-600 text-white rounded-md">Guardar</button>
            </div>
        </form>`;
    
    if (action.includes('pago')) {
        const mediosDePago = ['Transferencia', 'Efectivo', 'Tarjeta'];
        const select = container.querySelector('#medio-pago-select');
        mediosDePago.forEach(medio => select.add(new Option(medio, medio)));
        if (transaccion?.medioDePago) select.value = transaccion.medioDePago;
    }
    
    const form = container.querySelector('#modal-form-accion');
    form.addEventListener('submit', e => handleGroupFormSubmit(e, transaccion));
    form.querySelector('#form-cancel-btn').addEventListener('click', () => {
        if (action.includes('pago')) container.innerHTML = '';
        else modal.classList.add('hidden');
    });

    const docInput = form.querySelector('#documento-input');
    const pasteZone = form.querySelector('#paste-zone');
    const previewContainer = form.querySelector('#preview-container');
    const thumbnail = form.querySelector('#thumbnail');
    form.querySelector('#sin-documento-checkbox').addEventListener('change', e => pasteZone.style.display = e.target.checked ? 'none' : 'block');

    pasteZone.addEventListener('click', () => docInput.click());
    docInput.addEventListener('change', () => { if (docInput.files.length) showPreview(docInput.files[0], thumbnail, previewContainer); });
    document.addEventListener('paste', e => handlePaste(e, docInput, thumbnail, previewContainer));

    if (transaccion?.enlaceComprobante && transaccion.enlaceComprobante !== 'SIN_DOCUMENTO') showPreview(transaccion.enlaceComprobante, thumbnail, previewContainer);
    else if (action === 'gestionar_reserva' && currentGrupo.documentos.enlaceReserva) showPreview(currentGrupo.documentos.enlaceReserva, thumbnail, previewContainer);
}

// --- Lógica de Manejo de Formularios y Acciones ---

async function handleSaveKpi() {
    const descuento = document.getElementById('descuento-pct').value;
    const statusEl = document.getElementById('kpi-status');
    const saveBtn = document.getElementById('kpi-save-btn');
    if (!descuento || parseFloat(descuento) <= 0) {
        statusEl.textContent = 'Por favor, ingresa un porcentaje de descuento válido.';
        return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    try {
        await fetchAPI('/api/gestion/grupo/calcular-potencial', { method: 'POST', body: { reservaIdOriginal: currentGrupo.reservaIdOriginal, descuento }});
        modal.classList.add('hidden');
        gestionUI.loadGestion();
    } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Calcular y Guardar Potencial';
    }
}

async function handleSaveAjusteFinal() {
    const nuevoTotalCLP = document.getElementById('nuevo-valor-final').value;
    const statusEl = document.getElementById('ajuste-status');
    const saveBtn = document.getElementById('ajuste-save-btn');
    if (!nuevoTotalCLP || parseFloat(nuevoTotalCLP) < 0) {
        statusEl.textContent = 'Por favor, ingresa un monto final válido.';
        return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    try {
        await fetchAPI('/api/gestion/grupo/ajustar-monto-final', { method: 'POST', body: { reservaIdOriginal: currentGrupo.reservaIdOriginal, nuevoTotalCLP }});
        modal.classList.add('hidden');
        gestionUI.loadGestion();
    } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Ajustar Monto Final';
    }
}

function updateValoresTotal() {
    let total = Array.from(document.querySelectorAll('.valor-input')).reduce((sum, input) => sum + (parseFloat(input.value) || 0), 0);
    document.getElementById('ajuste-valores-total').textContent = formatCurrency(total);
}

async function handleSaveAjusteGrupo() {
    const valoresCabanas = Array.from(document.querySelectorAll('.valor-input')).map(input => ({ id: input.dataset.id, valor: input.value }));
    const statusEl = document.getElementById('ajuste-valores-status');
    statusEl.textContent = 'Guardando...';
    try {
        await fetchAPI('/api/gestion/grupo/ajustar-valores', { method: 'POST', body: { reservaIdOriginal: currentGrupo.reservaIdOriginal, valoresCabanas }});
        statusEl.textContent = '¡Valores guardados!';
        gestionUI.loadGestion();
    } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
    }
}

async function handleGroupFormSubmit(event, transaccion = null) {
    event.preventDefault();
    const form = event.target;
    const saveBtn = form.querySelector('#modal-save-btn');
    const statusEl = form.querySelector('#modal-status');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    
    const formData = new FormData();
    const detalles = {};
    const idsIndividuales = currentGrupo.reservasIndividuales.map(r => r.id);

    if (currentAction.includes('pago')) {
        detalles.monto = parseFloat(form.querySelector('#monto-input').value);
        detalles.medioDePago = form.querySelector('#medio-pago-select').value;
        detalles.tipo = form.querySelector('#pago-final-checkbox').checked ? 'Pago Final' : 'Abono';
        detalles.esPagoFinal = form.querySelector('#pago-final-checkbox').checked;
    }
    detalles.sinDocumento = form.querySelector('#sin-documento-checkbox').checked;
    const docInput = form.querySelector('#documento-input');
    if (docInput.files.length > 0 && !detalles.sinDocumento) {
        formData.append('documento', docInput.files[0]);
    }

    const endpoint = transaccion ? '/api/gestion/transaccion/editar' : '/api/gestion/actualizar-estado';
    if (transaccion) {
        formData.append('reservaId', transaccion.reservaId);
        formData.append('transaccionId', transaccion.id);
    } else {
        formData.append('accion', currentAction);
    }
    
    formData.append('detalles', JSON.stringify(detalles));
    formData.append('idsIndividuales', JSON.stringify(idsIndividuales));
    formData.append('reservaIdOriginal', currentGrupo.reservaIdOriginal);

    try {
        await fetchAPI(endpoint, { method: 'POST', body: formData });
        if (currentAction.includes('pago')) {
            form.parentElement.innerHTML = '';
            await renderPagosList();
        } else {
             modal.classList.add('hidden');
        }
        await gestionUI.loadGestion();
    } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar';
    }
}

async function handleDeleteTransaction(transaccionId, reservaId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este pago?')) return;
    try {
        await fetchAPI('/api/gestion/transaccion/eliminar', {
            method: 'POST',
            body: { reservaId, transaccionId, idsIndividuales: currentGrupo.reservasIndividuales.map(r => r.id) }
        });
        await renderPagosList();
        await gestionUI.loadGestion();
    } catch (error) {
        alert(`Error al eliminar el pago: ${error.message}`);
    }
}

function showPreview(fileOrUrl, thumb, container) {
    const isFile = fileOrUrl instanceof File;
    if (isFile && !fileOrUrl.type.startsWith('image/')) return;

    thumb.src = isFile ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
    container.classList.remove('hidden');
}

function handlePaste(e, docInput, thumb, container) {
    if (!modal.contains(e.target) && !gestionUI.bitacoraModal.contains(e.target)) return;
    const items = (e.clipboardData || window.clipboardData).items;
    for (const item of items) {
        if (item.type.includes('image')) {
            e.preventDefault();
            const blob = item.getAsFile();
            const file = new File([blob], "captura.png", { type: blob.type });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            docInput.files = dataTransfer.files;
            showPreview(file, thumb, container);
            break;
        }
    }
}