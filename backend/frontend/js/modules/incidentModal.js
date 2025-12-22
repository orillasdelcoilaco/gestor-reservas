// backend/frontend/js/modules/incidentModal.js
import { fetchAPI } from '../../api.js';
import { storage } from '../firebase-init.js'; // Updated import
import { ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

// ESPACIOS is still useful as a constant or could be dynamic. Keeping it static for now as it's standard.
const ESPACIOS = [
    'Dormitorio Principal', 'Dormitorio', 'Baño en Suite', 'Baño', 'Living',
    'Comedor', 'Cocina', 'Terraza', 'Quincho', 'Exterior'
];

const modal = document.getElementById('incident-modal');
const btnReport = document.getElementById('btn-report-incident');
const btnClose = document.getElementById('close-modal');
const form = document.getElementById('incident-form');
const selectSpace = document.getElementById('incident-space');

// Elements for Photo
const btnAddPhoto = document.getElementById('btn-add-photo');
const inputPhoto = document.getElementById('incident-photo');
const photoPreview = document.getElementById('photo-preview');
const photoStatus = document.getElementById('photo-status');
let compressedImageBase64 = null; // Store compressed data

export async function initIncidentModal() {
    // Populate Space Select
    selectSpace.innerHTML = '<option value="">Selecciona espacio...</option>';
    ESPACIOS.forEach(esp => {
        const opt = document.createElement('option');
        opt.value = esp;
        opt.textContent = esp;
        selectSpace.appendChild(opt);
    });

    // Populate Cabin Select Dynamically
    const incidentCabanaSelect = document.getElementById('incident-cabana');
    if (incidentCabanaSelect) {
        try {
            const result = await fetchAPI('/api/cabanas'); // Uses /api/cabanas endpoint
            incidentCabanaSelect.innerHTML = '<option value="">Selecciona Cabaña...</option>';
            // Assume result is array of objects { nombre: 'Cabaña 1', ... }
            if (Array.isArray(result)) {
                result.forEach(cab => {
                    const opt = document.createElement('option');
                    opt.value = cab.nombre;
                    opt.textContent = cab.nombre;
                    incidentCabanaSelect.appendChild(opt);
                });
            }
        } catch (e) {
            console.error("Error fetching cabins:", e);
            // Fallback?
        }
    }

    // --- PHOTO LOGIC ---
    if (btnAddPhoto && inputPhoto) {
        btnAddPhoto.addEventListener('click', () => inputPhoto.click());

        inputPhoto.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            photoStatus.textContent = 'Procesando...';

            // Compressor using Canvas
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Max width 1024px
                    const MAX_WIDTH = 1024;
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Output as JPEG 0.7 quality
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    compressedImageBase64 = dataUrl;

                    // Preview
                    photoPreview.src = dataUrl;
                    photoPreview.classList.remove('hidden');
                    photoStatus.textContent = 'Foto lista';
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Events
    if (btnReport) btnReport.addEventListener('click', () => modal.classList.remove('hidden'));
    if (btnClose) btnClose.addEventListener('click', () => modal.classList.add('hidden'));

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';

            let fotoUrl = null;

            // 1. Upload Photo if exists
            if (compressedImageBase64) {
                try {
                    const randomName = `incidencias/${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
                    const storageRef = ref(storage, randomName);

                    // Upload Base64 string
                    await uploadString(storageRef, compressedImageBase64, 'data_url');
                    fotoUrl = await getDownloadURL(storageRef);
                    console.log('Foto subida:', fotoUrl);
                } catch (uploadError) {
                    console.error('Error uploading photo:', uploadError);
                    alert('Error subiendo foto. Se intentará enviar el reporte sin foto.');
                }
            }

            // 2. Prepare Data
            const cabanaId = document.getElementById('incident-cabana')?.value || 'Sin Cabaña';

            const data = {
                espacio: selectSpace.value,
                descripcion: document.getElementById('incident-desc').value,
                cabanaId: cabanaId,
                fotoUrl: fotoUrl, // URL pública/tokenizada
                reportadoPor: { nombre: 'Estrella (Portal)', id: 'mobile-user' }
            };

            try {
                await fetchAPI('/api/incidencias', {
                    method: 'POST',
                    body: data
                });
                alert('Reporte enviado correctamente.');
                modal.classList.add('hidden');
                form.reset();
                compressedImageBase64 = null;
                photoPreview.classList.add('hidden');
                photoStatus.textContent = '';
            } catch (error) {
                console.error('Error reportando:', error);
                alert('Error al enviar reporte: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'ENVIAR REPORTE';
            }
        });
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Inject Cabin Selector if not present (Wait, we want to fetch it dynamically inside init)
    // Actually, looking at previous logic, it injected the HTML.
    // Let's ensure the HTML structure exists for `initIncidentModal` to find it.

    const spaceDiv = selectSpace.parentElement;
    if (!document.getElementById('incident-cabana')) {
        const div = document.createElement('div');
        div.className = 'mb-4';
        div.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-2">Cabaña</label>
            <select id="incident-cabana" class="w-full rounded-lg border-gray-300 p-3 bg-gray-50 text-lg" required>
                <option value="">Cargando...</option>
            </select>
        `;
        form.insertBefore(div, spaceDiv);
    }

    initIncidentModal();
});
