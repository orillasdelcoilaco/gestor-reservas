// backend/frontend/js/modules/incidentModal.js
import { fetchAPI } from '../../api.js';

// TODO: Fetch from backend config?
const ESPACIOS = [
    'Dormitorio Principal',
    'Dormitorio',
    'Baño en Suite',
    'Baño',
    'Living',
    'Comedor',
    'Cocina',
    'Terraza',
    'Quincho',
    'Exterior'
];

const modal = document.getElementById('incident-modal');
const btnReport = document.getElementById('btn-report-incident');
const btnClose = document.getElementById('close-modal');
const form = document.getElementById('incident-form');
const selectSpace = document.getElementById('incident-space');

export function initIncidentModal() {
    // Populate Select
    selectSpace.innerHTML = '<option value="">Selecciona espacio...</option>';
    ESPACIOS.forEach(esp => {
        const opt = document.createElement('option');
        opt.value = esp;
        opt.textContent = esp;
        selectSpace.appendChild(opt);
    });

    // Events
    btnReport.addEventListener('click', () => modal.classList.remove('hidden'));
    btnClose.addEventListener('click', () => modal.classList.add('hidden'));

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const icon = btnReport.innerHTML;
        const submitBtn = form.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        const data = {
            espacio: selectSpace.value,
            descripcion: document.getElementById('incident-desc').value,
            // TODO: Detect actual cabin from Active Task or Selection?
            // For now, prompt asking Cabin OR assume "General" / "Sin Cabaña" if not in task context?
            // Requirement says "Obligar a seleccionar un Espacio" but not explicit about Cabaña selector here?
            // "Gestión de Incidencias: ... seleccionar un Espacio".
            // Ideally should also select Cabin if not inferred.
            // Let's add Cabaña selector dynamically or static list for now.
            // For modularity, maybe add it to form HTML now.
            cabanaId: 'Cabaña X (Manual)', // Placeholder until UI update
            reportadoPor: { nombre: 'Estrella (Portal)', id: 'mobile-user' }
        };

        // Add Cabin Selector logic if missing in HTML (Reviewing HTML... it is missing).
        // I will inject it or prompt?
        // Better: I will Update HTML in next step or inject it via JS.
        // Let's inject a Cabin selector into the form via JS for now to be robust.

        if (!data.cabanaId || data.cabanaId === 'Cabaña X (Manual)') {
            // Find if there's a cabin selector in form, if not, use prompt or fail.
            // Actually, let's assume the user is "Reportando desde Cabaña 10" because they are physically there.
            // But the portal lists ALL tasks.
            // So we MUST ask for Cabaña.
            const cabinaExplicita = document.getElementById('incident-cabana')?.value;
            if (cabinaExplicita) data.cabanaId = cabinaExplicita;
        }

        try {
            await fetchAPI('/api/incidencias', {
                method: 'POST',
                body: data
            });
            alert('Reporte enviado correctamente. El administrador ha sido notificado.');
            modal.classList.add('hidden');
            form.reset();
        } catch (error) {
            console.error('Error reportando:', error);
            alert('Error al enviar reporte: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'ENVIAR REPORTE';
        }
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Inject Cabin Selector if not present
    const spaceDiv = selectSpace.parentElement;
    if (!document.getElementById('incident-cabana')) {
        const div = document.createElement('div');
        div.className = 'mb-4';
        div.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-2">Cabaña</label>
            <select id="incident-cabana" class="w-full rounded-lg border-gray-300 p-3 bg-gray-50 text-lg" required>
                <option value="">Selecciona Cabaña...</option>
                <option value="Cabaña 10">Cabaña 10</option>
                <option value="Cabaña 11">Cabaña 11</option>
                <option value="Cabaña 12">Cabaña 12</option>
                <option value="Cabaña 14">Cabaña 14</option>
                <option value="Cabaña 15">Cabaña 15</option>
            </select>
        `;
        form.insertBefore(div, spaceDiv);
    }

    initIncidentModal();
});
