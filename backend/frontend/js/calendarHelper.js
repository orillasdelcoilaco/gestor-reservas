import { fetchAPI } from '../api.js';

let calendar;
let currentDate = new Date();
const channelColors = {
    'SODC': '#3498db',
    'Booking': '#2980b9',
    'Airbnb': '#e74c3c',
    'App': '#2ecc71',
    'Default': '#95a5a6'
};

export async function initCalendar(containerId) {
    const calendarEl = document.getElementById(containerId);
    if (!calendarEl) {
        console.error(`Calendar container '${containerId}' not found.`);
        return;
    }

    // Create custom header controls if they don't exist
    // We expect the container to be empty or contain structure we want to overwrite/append to
    // For this helper, let's inject the header + calendar div structure
    calendarEl.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-2 border-b pb-2">
            <h2 class="text-lg font-semibold text-gray-900">Calendario de Ocupación</h2>
            <div class="flex items-center space-x-2 mt-2 md:mt-0">
                <button id="cal-prev-btn" class="p-1 rounded-md hover:bg-gray-100 text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h3 id="cal-month-year" class="text-sm font-semibold text-gray-800 w-32 text-center capitalize"></h3>
                <button id="cal-next-btn" class="p-1 rounded-md hover:bg-gray-100 text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
        </div>
        <div id="fullcalendar-instance"></div>
    `;

    const fullCalendarEl = calendarEl.querySelector('#fullcalendar-instance');
    const monthLabel = calendarEl.querySelector('#cal-month-year');
    const prevBtn = calendarEl.querySelector('#cal-prev-btn');
    const nextBtn = calendarEl.querySelector('#cal-next-btn');

    function updateMonthLabel() {
        monthLabel.textContent = currentDate.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    }

    async function loadEventsForMonth(year, month) {
        try {
            const events = await fetchAPI(`/api/reservas/calendario?anio=${year}&mes=${month}`);
            calendar.removeAllEvents();
            calendar.addEventSource(events);
        } catch (error) {
            console.error('Error al cargar eventos:', error);
        }
    }

    try {
        const initialData = await fetchAPI('/api/calendario/datos-iniciales');

        calendar = new FullCalendar.Calendar(fullCalendarEl, {
            schedulerLicenseKey: 'CC-Attribution-NonCommercial-NoDerivatives',
            initialView: 'resourceTimelineMonth',
            locale: 'es',
            height: '100%', // Flexible height for sticky view
            headerToolbar: false,
            editable: false,
            resourceAreaWidth: '120px',
            resources: initialData.recursos,
            events: initialData.eventos,
            slotMinWidth: 40, // More compact
            eventDataTransform: function (eventData) {
                const canal = eventData.extendedProps.canal || 'Default';
                return {
                    ...eventData,
                    backgroundColor: channelColors[canal] || channelColors['Default'],
                    borderColor: channelColors[canal] || channelColors['Default']
                };
            },
            eventDidMount: function (info) {
                info.el.setAttribute('title', `${info.event.title} (${info.event.extendedProps.canal})`);
            }
        });

        calendar.render();
        updateMonthLabel();

        // Bind Nav Buttons
        prevBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            calendar.prev();
            updateMonthLabel();
            loadEventsForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);
        });

        nextBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            calendar.next();
            updateMonthLabel();
            loadEventsForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);
        });

    } catch (error) {
        calendarEl.innerHTML = `<p class="text-red-500 text-sm">Error cargando calendario: ${error.message}</p>`;
    }
    return calendar;
}
