// frontend/router.js
import { fetchAPI } from './api.js';

function getBasePath() {
    const path = window.location.pathname;
    // Asegura que la ruta base siempre termine con una barra
    const basePath = path.substring(0, path.lastIndexOf('/') + 1);
    return basePath;
}

const basePath = getBasePath();

const routes = {
    '/': `${basePath}views/dashboard.html`,
    '/gestion-diaria': `${basePath}views/gestion.html`,
    '/calendario': `${basePath}views/calendario.html`,
    '/reportes': `${basePath}views/reportes.html`,
    '/agregar-propuesta': `${basePath}views/agregar-reserva.html`,
    '/gestionar-propuestas': `${basePath}views/propuestas.html`,
    '/clientes': `${basePath}views/clientes.html`,
    '/mensajes': `${basePath}views/mensajes.html`,
    '/sincronizar-drive': `${basePath}views/sincronizar.html`,
    '/procesar': `${basePath}views/procesar.html`,
    '/sincronizar-ical': `${basePath}views/sincronizacion-ical.html`,
    '/cabanas': `${basePath}views/gestion-cabanas.html`,
    '/tarifas': `${basePath}views/tarifas.html`,
    '/reservas': `${basePath}views/reservas.html`,
    '/cargar-dolar': `${basePath}views/dolar.html`,
    '/autorizar': `${basePath}views/autorizar.html`,
    '/mantenimiento': `${basePath}views/mantenimiento.html`
};

const menuConfig = [
    { name: '📊 Dashboard', path: '/', id: 'dashboard' },
    { 
        name: '⚙️ Gestión Operativa',
        id: 'gestion-operativa',
        children: [
            { name: 'Gestión Diaria', path: '/gestion-diaria', id: 'gestion-diaria' },
            { name: 'Calendario de Ocupación', path: '/calendario', id: 'calendario' },
            { name: 'Reportes Rápidos', path: '/reportes', id: 'reportes' }
        ]
    },
    {
        name: '📈 Ventas y Clientes',
        id: 'ventas-clientes',
        children: [
            { name: 'Agregar Propuesta', path: '/agregar-propuesta', id: 'agregar-propuesta' },
            { name: 'Gestionar Propuestas', path: '/gestionar-propuestas', id: 'gestionar-propuestas' },
            { name: 'Gestionar Clientes', path: '/clientes', id: 'clientes' },
            { name: 'Generar Mensajes', path: '/mensajes', id: 'mensajes' }
        ]
    },
    {
        name: '🔄 Sincronización',
        id: 'sincronizacion',
        children: [
            { name: 'Sincronizar (Google Drive)', path: '/sincronizar-drive', id: 'sincronizar-drive' },
            { name: 'Procesar y Consolidar', path: '/procesar', id: 'procesar' },
            { name: 'Sincronizar Calendarios (iCal)', path: '/sincronizar-ical', id: 'sincronizar-ical' }
        ]
    },
    {
        name: '🛠️ Configuración',
        id: 'configuracion',
        children: [
            { name: 'Gestionar Cabañas', path: '/cabanas', id: 'cabanas' },
            { name: 'Gestionar Tarifas', path: '/tarifas', id: 'tarifas' },
            { name: 'Gestionar Reservas', path: '/reservas', id: 'reservas' },
            { name: 'Cargar Valor Dólar', path: '/cargar-dolar', id: 'cargar-dolar' },
            { name: 'Autorizar Google Contacts', path: '/autorizar', id: 'autorizar' },
            { name: 'Herramientas de Mantenimiento', path: '/mantenimiento', id: 'mantenimiento' }
        ]
    }
];

const loadView = async () => {
    // --- INICIO DE LA CORRECCIÓN ---
    // Tomamos la ruta completa del hash (ej: /mensajes?reservaId=123)
    const fullPath = location.hash.slice(1).toLowerCase() || '/';
    // Separamos la ruta base de los parámetros de consulta
    const path = fullPath.split('?')[0]; // Esto nos dará solo '/mensajes'
    // --- FIN DE LA CORRECCIÓN ---

    const viewContainer = document.getElementById('view-content');
    viewContainer.innerHTML = '<p class="text-center text-gray-500">Cargando...</p>';
    
    // Usamos el 'path' limpio para encontrar el archivo, pero el hash completo sigue disponible en la URL
    // para que la vista 'mensajes.html' pueda leer los parámetros.
    const viewFile = routes[path] || `${basePath}views/404.html`;

    try {
        const response = await fetch(viewFile);
        
        if (!response.ok) {
            throw new Error(`Página no encontrada (Estado: ${response.status})`);
        }
        
        const html = await response.text();
        viewContainer.innerHTML = ''; 

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        const scriptElement = tempDiv.querySelector('script[type="module"]');
        let scriptContent = '';
        if (scriptElement) {
            scriptContent = scriptElement.innerHTML;
            scriptElement.remove();
        }

        while(tempDiv.firstChild) {
            viewContainer.appendChild(tempDiv.firstChild);
        }

        if (scriptContent) {
            const scriptModule = document.createElement('script');
            scriptModule.type = 'module';
            scriptModule.textContent = scriptContent;
            document.body.appendChild(scriptModule).remove();
        }

    } catch (error) {
        viewContainer.innerHTML = `<p class="text-center text-red-500">Error al cargar la página: ${error.message}</p>`;
    }
};

const buildMenu = () => {
    const nav = document.getElementById('main-nav');
    let menuHtml = '';

    menuConfig.forEach(item => {
        if (item.children) {
            menuHtml += `<div class="menu-category">
                            <span class="category-title">${item.name}</span>
                            <ul>`;
            item.children.forEach(child => {
                menuHtml += `<li><a href="#${child.path}" class="nav-link">${child.name}</a></li>`;
            });
            menuHtml += `</ul></div>`;
        } else {
            menuHtml += `<ul><li><a href="#${item.path}" class="nav-link single-link">${item.name}</a></li></ul>`;
        }
    });
    nav.innerHTML = menuHtml;
};

export const initRouter = () => {
    buildMenu();
    
    window.addEventListener('hashchange', loadView);
    
    if (!location.hash) {
        location.hash = '#/';
    } else {
        loadView();
    }
};