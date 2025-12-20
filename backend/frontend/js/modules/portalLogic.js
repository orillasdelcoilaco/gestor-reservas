import { db, auth } from '../firebase-init.js';
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { signInWithCustomToken, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// --- CONFIG ---
// TODO: Fetch from backend config?
const SOP_PROTOCOLS = {
    'Cambio': [
        'Retirar sábanas y toallas sucias',
        'Ventilar habitaciones (min 15 min)',
        'Limpiar baño completo',
        'Hacer camas con ropa limpia',
        'Barrido y mopeado general',
        'Reponer amenities (shampoo, jabón)',
        'Verificar luces y control remoto'
    ],
    'Salida': [
        'Revisión Inventario Completo',
        'Limpieza profunda cocina y refri',
        'Revisión bajo camas y sofás',
        'Limpieza vidrios interiores',
        'Protocolo de olvidos (Lost & Found)',
        'Cerrar llaves de paso si no hay entrada hoy'
    ],
    'Limpieza': [ // Default/Repaso
        'Hacer camas',
        'Limpiar baño superficial',
        'Retirar basura',
        'Barrido general',
        'Verificar toallas'
    ]
};

let currentTasks = [];
let currentWorkerId = 'Principal';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check for Magic Token
    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get('token');

    if (magicToken) {
        // Attempt Magic Login
        try {
            console.log('🔮 Magic Link detected. Authenticating...');
            document.getElementById('loading-spinner').classList.remove('hidden');

            const response = await fetch('/api/auth/magic-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: magicToken })
            });

            const data = await response.json();

            if (data.success) {
                await signInWithCustomToken(auth, data.token);
                console.log('✅ Magic Login Success. Welcome ' + data.worker.nombre);
                currentWorkerId = data.worker.id;

                // Clean URL (Security)
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                alert('Enlace expirado o inválido. Por favor solicita uno nuevo.');
                window.location.href = 'index.html';
                return;
            }
        } catch (error) {
            console.error('Magic Login Error:', error);
            alert('Error iniciando sesión. Intenta nuevamente.');
            window.location.href = 'index.html';
            return;
        }
    }

    // 2. Init App (only if auth state is resolved)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in.
            // If we didn't set currentWorkerId from magic login, we might want to fetch it from profile
            // For now, if logged in via magic link, the id matches the claim.
            // But if previously logged in, user.uid matches worker.id? 
            // In magic flow: uid = worker.id.
            currentWorkerId = user.uid; // Since we set uid to workerId in createCustomToken
            console.log('Logged in as:', currentWorkerId);
            initPortal();
        } else {
            // Check if we are currently processing a magic token
            const params = new URLSearchParams(window.location.search);
            if (!params.get('token')) {
                console.warn('No active session and no token. Redirecting...');
                window.location.href = 'index.html';
            } else {
                console.log('⏳ Waiting for Magic Login...');
            }
        }
    });
});

function initPortal() {
    updateDateDisplay();
    startTaskListener();
}

function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = new Date().toLocaleDateString('es-CL', options);
    document.getElementById('current-date').textContent = dateStr;
    // Mock worker name fetch
    // document.getElementById('worker-name').textContent = "Estrella Pardo"; 
}

function startTaskListener() {
    const spinner = document.getElementById('loading-spinner');
    const container = document.getElementById('tasks-container');

    // Query: Tasks for TODAY (local estimation)
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

    const q = query(
        collection(db, "planAseo"),
        where("fecha", ">=", Timestamp.fromDate(startOfDay)),
        where("fecha", "<=", Timestamp.fromDate(endOfDay)),
        // where("asignadoA", "==", currentWorkerId) // Uncomment when worker filtering is real
        // orderBy("horarioInicio") // Requires composite index usually
    );

    onSnapshot(q, (snapshot) => {
        spinner.classList.add('hidden');
        currentTasks = [];
        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center text-gray-500 py-10">No hay tareas programadas para hoy.</p>';
            return;
        }

        const tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort manually to avoid index issues initially
        tasks.sort((a, b) => (a.horarioInicio || '').localeCompare(b.horarioInicio || ''));

        tasks.forEach(task => {
            const card = createTaskCard(task);
            container.appendChild(card);
        });
        currentTasks = tasks;

        document.getElementById('connection-status').classList.remove('bg-yellow-500', 'bg-red-500');
        document.getElementById('connection-status').classList.add('bg-green-500');

    }, (error) => {
        console.error("Error loading tasks:", error);
        document.getElementById('connection-status').classList.add('bg-red-500');
        container.innerHTML = `<p class="text-red-500 text-center">Error de conexión: ${error.message}</p>`;
    });
}

function createTaskCard(task) {
    const div = document.createElement('div');
    // Determine color based on type
    let colorClass = 'bg-white border-l-4 border-gray-300';
    if (task.tipoAseo === 'Cambio') colorClass = 'bg-task-red';
    else if (task.tipoAseo === 'Salida') colorClass = 'bg-task-green';
    else if (task.tipoAseo === 'Limpieza' || task.tipoAseo === 'Repaso') colorClass = 'bg-task-yellow';

    const isDone = task.estado === 'FINALIZADO';
    div.className = `p-4 rounded-lg shadow-sm ${colorClass} card-tarea cursor-pointer relative overflow-hidden`;
    if (isDone) div.classList.add('opacity-60', 'grayscale');

    div.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <h3 class="text-lg font-bold text-gray-800">${task.cabanaId}</h3>
                <p class="text-sm font-semibold text-gray-700 uppercase">${task.tipoAseo}</p>
                <div class="flex items-center mt-1 text-gray-600 text-sm">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ${task.horarioInicio || '--:--'} - ${task.horarioFin || '--:--'}
                </div>
            </div>
            ${isDone ? '<span class="px-2 py-1 bg-green-200 text-green-800 text-xs font-bold rounded-full">LISTO</span>' : ''}
        </div>
        ${task.context && task.context.reserva ? `
            <div class="mt-2 pt-2 border-t border-gray-200/50">
                <p class="text-xs text-gray-500">Huésped: <span class="font-medium">${task.context.reserva.cliente || 'Desconocido'}</span></p>
                <p class="text-xs text-gray-500 max-h-16 overflow-y-auto">${task.descripcion || ''}</p>
            </div>
        ` : ''}
    `;

    // Click handler -> Open SOP Modal
    div.addEventListener('click', () => isDone ? null : openSOP(task));

    return div;
}

// --- SOP MODAL LOGIC ---
const sopModal = document.getElementById('sop-modal');
const sopTitle = document.getElementById('sop-title');
const sopContent = document.getElementById('sop-content');
const finishBtn = document.getElementById('finish-task-btn');
const closeSopBtn = document.getElementById('close-sop');

let activeTask = null;

function openSOP(task) {
    activeTask = task;
    sopTitle.textContent = `${task.tipoAseo} - ${task.cabanaId}`;
    sopModal.classList.remove('hidden');

    // Get checklist
    const checklist = SOP_PROTOCOLS[task.tipoAseo] || SOP_PROTOCOLS['Limpieza'];

    sopContent.innerHTML = '';
    let checkedCount = 0;

    checklist.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'sop-item flex items-center';
        row.innerHTML = `
            <input type="checkbox" id="sop-${index}" class="sop-checkbox form-checkbox h-6 w-6 text-indigo-600 rounded">
            <label for="sop-${index}" class="flex-1 text-gray-800 text-lg ml-3 cursor-pointer select-none">${item}</label>
        `;
        sopContent.appendChild(row);

        // Logic to enable Finish button
        const chk = row.querySelector('input');
        chk.addEventListener('change', () => {
            if (chk.checked) checkedCount++; else checkedCount--;
            finishBtn.disabled = checkedCount < checklist.length;
        });
    });

    finishBtn.disabled = true; // Start disabled
}

closeSopBtn.addEventListener('click', () => {
    sopModal.classList.add('hidden');
    activeTask = null;
});

finishBtn.addEventListener('click', async () => {
    if (!activeTask) return;

    finishBtn.textContent = 'Guardando...';
    try {
        const taskRef = doc(db, "planAseo", activeTask.id);
        await updateDoc(taskRef, {
            estado: 'FINALIZADO', // Uppercase to match convention
            completedAt: Timestamp.now()
        });

        sopModal.classList.add('hidden');
        // Visual feedback handles itself via onSnapshot
    } catch (error) {
        console.error("Error completing task:", error);
        alert('Error al finalizar tarea. Intente nuevamente.');
    } finally {
        finishBtn.textContent = '✅ FINALIZAR CABAÑA';
    }
});
