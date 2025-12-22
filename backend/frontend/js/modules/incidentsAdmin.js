// backend/frontend/js/modules/incidentsAdmin.js
import { db } from '../firebase-init.js';
import {
    collection, query, where, onSnapshot, orderBy, doc, updateDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

let modal, listContainer, btnClose, btnOpen;
let unsubscribeList = null;

export function initIncidentsAdmin() {
    modal = document.getElementById('admin-incidents-modal');
    listContainer = document.getElementById('admin-incidents-list');
    btnClose = document.getElementById('close-admin-incidents');
    btnOpen = document.getElementById('btn-workflow-incidencias');

    if (btnOpen) {
        btnOpen.addEventListener('click', () => {
            openModal();
        });
    }
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            closeModal();
        });
    }
}

function openModal() {
    modal.classList.remove('hidden');
    // Start Listening
    const q = query(
        collection(db, "incidencias"),
        where("estado", "==", "PENDIENTE"),
        orderBy("prioridad"), // URGENTE -> NORMAL -> BAJA (Alphabetical? No. URGENTE > NORMAL)
        // Alphabetical: B(aja), N(ormal), U(rgente).
        // If sorting URGENTE first, we might need custom sort or specific priorities.
        // Let's sort by dateReported desc for now, or filter in memory.
        orderBy("fechaReporte", "desc")
    );

    unsubscribeList = onSnapshot(q, (snapshot) => {
        renderList(snapshot.docs);
    });
}

function closeModal() {
    modal.classList.add('hidden');
    if (unsubscribeList) unsubscribeList();
}

function renderList(docs) {
    listContainer.innerHTML = '';
    if (docs.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 py-4">No hay incidencias pendientes. ¡Todo en orden!</p>';
        return;
    }

    docs.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        const div = document.createElement('div');
        div.className = `incident-item p-4 rounded-lg border shadow-sm ${data.prioridad} flex justify-between items-start`;

        const dateStr = data.fechaReporte ? data.fechaReporte.toDate().toLocaleString('es-CL') : 'Sin fecha';

        div.innerHTML = `
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <span class="font-bold text-gray-900 text-lg">${data.cabanaId}</span>
                    <span class="text-sm px-2 py-0.5 rounded bg-gray-200 text-gray-700">${data.espacio}</span>
                    <span class="text-xs font-bold px-2 py-0.5 rounded ${getPriorityColor(data.prioridad)} text-white">${data.prioridad}</span>
                </div>
                <p class="text-gray-800 font-medium">${data.descripcion}</p>
                ${data.fotoUrl ? `<div class="mt-2"><a href="${data.fotoUrl}" target="_blank"><img src="${data.fotoUrl}" class="h-24 rounded border hover:scale-105 transition"></a></div>` : ''}
                <div class="text-xs text-gray-500 mt-2">
                    Reportado por: ${data.reportadoPor?.nombre || '??'} • ${dateStr}
                </div>
            </div>
            <div class="flex flex-col gap-2">
                <button class="btn-resolve bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-sm font-bold shadow-sm" data-id="${id}">
                    ✓ Resolver
                </button>
                <button class="btn-downgrade bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 text-sm" data-id="${id}">
                    ⬇ Bajar Prioridad
                </button>
            </div>
        `;

        // Actions
        div.querySelector('.btn-resolve').addEventListener('click', () => resolveIncident(id));
        div.querySelector('.btn-downgrade').addEventListener('click', () => changePriority(id, 'NORMAL')); // Example logic

        listContainer.appendChild(div);
    });
}

function getPriorityColor(p) {
    if (p === 'URGENTE') return 'bg-red-500';
    if (p === 'NORMAL') return 'bg-blue-500';
    return 'bg-green-500';
}

async function resolveIncident(id) {
    if (!confirm('¿Marcar incidencia como RESUELTA?')) return;
    try {
        await updateDoc(doc(db, "incidencias", id), {
            estado: 'RESUELTA',
            fechaResolucion: Timestamp.now()
        });
    } catch (e) {
        console.error(e);
        alert('Error al resolver');
    }
}

async function changePriority(id, newPriority) {
    try {
        await updateDoc(doc(db, "incidencias", id), {
            prioridad: newPriority
        });
    } catch (e) {
        console.error(e);
        alert('Error al actualizar prioridad');
    }
}
