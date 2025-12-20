// backend/frontend/js/modules/badgeMonitor.js
import { db, auth } from '../firebase-init.js';
import { collection, query, where, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

let unsubscribeIncidencias = null;
let unsubscribeActividades = null;

export function initBadgeMonitor() {
    console.log('[BadgeMonitor] Esperando autenticación...');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('[BadgeMonitor] Usuario autenticado. Iniciando listeners...');
            startListeners();
        } else {
            console.log('[BadgeMonitor] Usuario no autenticado. Deteniendo listeners.');
            stopListeners();
        }
    });
}

function startListeners() {
    // Evitar duplicar listeners si se llama multiples veces
    if (unsubscribeIncidencias || unsubscribeActividades) return;

    // 1. Incidencias Listener
    try {
        const qIncidencias = query(collection(db, "incidencias"), where("estado", "==", "PENDIENTE"));
        unsubscribeIncidencias = onSnapshot(qIncidencias, (snapshot) => {
            updateBadge('badge-incidencias', snapshot.size);
        }, (error) => {
            if (error.code !== 'permission-denied') console.error("Error monitoring inc:", error);
        });
    } catch (e) { console.error(e); }

    // 2. Actividades Listener (Tareas de HOY no finalizadas)
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const endToday = new Date(); endToday.setHours(23, 59, 59, 999);

        const qActividades = query(
            collection(db, "planAseo"),
            where("fecha", ">=", Timestamp.fromDate(today)),
            where("fecha", "<=", Timestamp.fromDate(endToday))
        );

        unsubscribeActividades = onSnapshot(qActividades, (snapshot) => {
            const pending = snapshot.docs.filter(d => d.data().estado !== 'FINALIZADO').length;
            updateBadge('badge-actividades', pending);
        }, (error) => {
            if (error.code !== 'permission-denied') console.error("Error monitoring tasks:", error);
        });
    } catch (e) { console.error(e); }
}

function stopListeners() {
    if (unsubscribeIncidencias) { unsubscribeIncidencias(); unsubscribeIncidencias = null; }
    if (unsubscribeActividades) { unsubscribeActividades(); unsubscribeActividades = null; }
}

function updateBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    if (count > 0) el.classList.remove('hidden');
    else el.classList.add('hidden');
}
