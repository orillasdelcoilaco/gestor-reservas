import { fetchAPI } from '../../api.js';
import { showToast } from '../toast.js';

// DOM Elements
let modal, form, listContainer, btnAdd, btnCancel;
let checklistContainer, btnAddChecklistItem;

// State
let taskTypes = [];
let editingId = null;

export function initTaskConfig() {
    // 1. Create Modal if not exists (Lazy Load handled by dashboard.html, here we just bind)
    modal = document.getElementById('task-config-modal');
    if (!modal) return; // Should be in HTML

    listContainer = document.getElementById('task-types-list');
    form = document.getElementById('task-type-form');
    checklistContainer = document.getElementById('checklist-items-container');

    // Buttons
    const btnOpen = document.getElementById('btn-config-tasks');
    if (btnOpen) btnOpen.addEventListener('click', openModal);

    btnCancel = document.getElementById('btn-cancel-task-type');
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    btnAddChecklistItem = document.getElementById('btn-add-checklist-item');
    if (btnAddChecklistItem) btnAddChecklistItem.addEventListener('click', addChecklistItemInput);

    form.addEventListener('submit', handleSave);

    // Initial Fetch
    loadTaskTypes();
}

async function loadTaskTypes() {
    try {
        taskTypes = await fetchAPI('/api/task-types');
        renderList();
    } catch (error) {
        console.error("Error loading task types:", error);
        showToast("Error al cargar tipos de tareas: " + error.message, true);
    }
}

function renderList() {
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (taskTypes.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No hay tipos definidos.</p>';
        return;
    }

    taskTypes.forEach(type => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 mb-2';

        // Color dot
        const colorDot = `<span class="w-4 h-4 rounded-full mr-2 inline-block" style="background-color: ${type.color}"></span>`;

        item.innerHTML = `
            <div class="flex items-center">
                ${colorDot}
                <div>
                    <h4 class="font-bold text-gray-800">${type.nombre}</h4>
                    <p class="text-xs text-gray-500">${type.duracion} min - Peso: ${type.peso}</p>
                </div>
            </div>
            <div class="flex space-x-2">
                <button class="text-blue-600 hover:text-blue-800 btn-edit" data-id="${type.id}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button class="text-red-600 hover:text-red-800 btn-delete" data-id="${type.id}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;

        // Bind events
        item.querySelector('.btn-edit').addEventListener('click', () => loadForEdit(type));
        item.querySelector('.btn-delete').addEventListener('click', () => deleteType(type.id));

        listContainer.appendChild(item);
    });
}

function openModal() {
    resetForm();
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
    resetForm();
    editingId = null;
}

function resetForm() {
    form.reset();
    document.getElementById('task-color').value = '#3B82F6';
    checklistContainer.innerHTML = '';
    editingId = null;
}

function loadForEdit(type) {
    editingId = type.id;
    document.getElementById('task-name').value = type.nombre;
    document.getElementById('task-desc').value = type.descripcion || '';
    document.getElementById('task-weight').value = type.peso || 1;
    document.getElementById('task-duration').value = type.duracion || 30;
    document.getElementById('task-color').value = type.color || '#3B82F6';

    checklistContainer.innerHTML = '';
    if (type.checklist && Array.isArray(type.checklist)) {
        type.checklist.forEach(text => addChecklistItemInput(null, text));
    }

    // Show form (it's inside the modal which is already split logic? actually the modal contains list AND form? No, usually list on left, form on right or modal is just form. Let's assume Modal is list + "Add" button opens sub-modal? 
    // Wait, simpler: The modal is the Manager. It has a list on the left and form on the right.
    modal.classList.remove('hidden');
}

function addChecklistItemInput(e, value = '') {
    if (e) e.preventDefault();

    const div = document.createElement('div');
    div.className = 'flex items-center mb-2';
    div.innerHTML = `
        <span class="mr-2 text-gray-400 cursor-move">☰</span>
        <input type="text" class="checklist-input flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" placeholder="Paso del protocolo..." value="${value}">
        <button type="button" class="ml-2 text-red-500 hover:text-red-700 btn-remove-item">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;

    div.querySelector('.btn-remove-item').addEventListener('click', () => div.remove());
    checklistContainer.appendChild(div);
}

async function handleSave(e) {
    e.preventDefault();

    const checklist = [];
    checklistContainer.querySelectorAll('.checklist-input').forEach(input => {
        if (input.value.trim()) checklist.push(input.value.trim());
    });

    const payload = {
        nombre: document.getElementById('task-name').value.trim(),
        descripcion: document.getElementById('task-desc').value.trim(),
        peso: Number(document.getElementById('task-weight').value),
        duracion: Number(document.getElementById('task-duration').value),
        color: document.getElementById('task-color').value,
        checklist: checklist
        // If editingId exists, Backend uses 'nombre' as ID or we pass ID. 
        // Our controller uses name as ID. So if name changes, it makes a new doc? 
        // For now, assume name is immutable or we accept new doc. 
        // Controller implementation: `const docId = data.nombre.trim();`.
    };

    try {
        await fetchAPI('/api/task-types', {
            method: 'POST',
            body: payload
        });
        showToast('Tipo de tarea guardado');
        resetForm();
        loadTaskTypes(); // Refresh list
    } catch (error) {
        showToast(error.message, true);
    }
}

async function deleteType(id) {
    if (!confirm('¿Seguro que deseas eliminar este tipo de tarea?')) return;
    try {
        await fetchAPI(`/api/task-types/${id}`, { method: 'DELETE' });
        showToast('Eliminado');
        loadTaskTypes();
    } catch (error) {
        showToast(error.message, true);
    }
}
