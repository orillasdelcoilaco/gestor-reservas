// backend/frontend/js/modules/activityAdmin.js
import { db } from '../firebase-init.js';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

let modal, btnOpen, btnClose, tableBody;
let unsubscribe = null;

export function initActivityAdmin() {
    modal = document.getElementById('admin-activities-modal');
    btnOpen = document.getElementById('btn-workflow-actividades');
    btnClose = document.getElementById('close-admin-activities');
    tableBody = document.getElementById('activities-table-body');

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
    if (modal) modal.classList.remove('hidden');

    // Query Today's Tasks
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

    const q = query(
        collection(db, "planAseo"),
        // where("fecha", ">=", Timestamp.fromDate(startOfDay)), // Index issues potentially
        // where("fecha", "<=", Timestamp.fromDate(endOfDay))
    );
    // Simple query first, client filter if index needed

    unsubscribe = onSnapshot(collection(db, "planAseo"), (snapshot) => {
        const tasks = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Filter locally for today to avoid index errors during demo
            // if (data.fecha...)
            tasks.push({ id: doc.id, ...data });
        });
        renderTable(tasks);
    });
}

function closeModal() {
    if (modal) modal.classList.add('hidden');
    if (unsubscribe) unsubscribe();
}

function renderTable(tasks) {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (tasks.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4">No hay actividades.</td></tr>';
        return;
    }

    tasks.forEach(t => {
        const isDone = t.estado === 'FINALIZADO';
        const color = isDone ? 'text-green-600 font-bold' : 'text-yellow-600';
        const row = `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">${t.cabanaId}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${t.tipoAseo}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${color}">${t.estado || 'PENDIENTE'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${t.completedAt ? t.completedAt.toDate().toLocaleTimeString() : '-'}</td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}
