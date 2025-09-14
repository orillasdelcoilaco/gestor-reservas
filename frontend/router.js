<<<<<<< HEAD
import { fetchAPI } from './api.js';

const routes = {
    '/': 'views/dashboard.html',
    '/gestion-diaria': 'views/gestion.html',
    '/calendario': 'views/calendario.html',
    '/reportes': 'views/reportes.html',
    '/agregar-propuesta': 'views/agregar-reserva.html',
    '/gestionar-propuestas': 'views/propuestas.html',
    '/clientes': 'views/clientes.html',
    '/mensajes': 'views/mensajes.html',
    '/sincronizar-drive': 'views/sincronizar.html',
    '/procesar': 'views/procesar.html',
    '/sincronizar-ical': 'views/sincronizacion-ical.html',
    '/cabanas': 'views/gestion-cabanas.html',
    '/tarifas': 'views/tarifas.html',
    '/reservas': 'views/reservas.html',
    '/cargar-dolar': 'views/dolar.html',
    '/autorizar': 'views/autorizar.html'
=======
// frontend/router.js
import { fetchAPI } from './api.js';

function getBasePath() {
    const path = window.location.pathname;
    const basePath = path.substring(0, path.lastIndexOf('/') + 1);
    console.log('[DEBUG] Base path calculado:', basePath); // LOG 1
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
>>>>>>> 3289b388955acde3b3e3f0db3241b8d35060cf72
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
<<<<<<< HEAD
            { name: 'Autorizar Google Contacts', path: '/autorizar', id: 'autorizar' }
=======
            { name: 'Autorizar Google Contacts', path: '/autorizar', id: 'autorizar' },
            { name: 'Herramientas de Mantenimiento', path: '/mantenimiento', id: 'mantenimiento' }
>>>>>>> 3289b388955acde3b3e3f0db3241b8d35060cf72
        ]
    }
];

<<<<<<< HEAD
const loadView = async (path) => {
    const viewContainer = document.getElementById('view-content');
    viewContainer.innerHTML = '<p class="text-center text-gray-500">Cargando...</p>';
    
    const viewPath = routes[path] || 'views/404.html';
    
    try {
        const response = await fetch(viewPath);
        if (!response.ok) throw new Error('Página no encontrada');
        const html = await response.text();
        viewContainer.innerHTML = html;
        
        // Cargar y ejecutar el script asociado si existe
        const scriptModule = document.createElement('script');
        scriptModule.type = 'module';
        scriptModule.innerHTML = viewContainer.querySelector('script[type="module"]')?.innerHTML || '';
        viewContainer.appendChild(scriptModule);

    } catch (error) {
=======
const resolveRoute = () => {
    const path = location.hash.slice(1).toLowerCase() || '/';
    console.log('[DEBUG] Ruta resuelta desde el hash:', path); // LOG 2
    return path;
};

const loadView = async () => {
    const path = resolveRoute();
    const viewContainer = document.getElementById('view-content');
    viewContainer.innerHTML = '<p class="text-center text-gray-500">Cargando...</p>';
    
    const viewFile = routes[path] || `${basePath}views/404.html`;
    
    // --- INICIO DE LA MODIFICACIÓN: AÑADIR LOGS ---
    console.log(`[DEBUG] Intentando cargar la vista desde: ${viewFile}`); // LOG 3
    // --- FIN DE LA MODIFICACIÓN ---

    try {
        const response = await fetch(viewFile);
        console.log('[DEBUG] Respuesta de fetch recibida. Estado:', response.status, 'OK:', response.ok); // LOG 4
        
        if (!response.ok) {
            console.error('[DEBUG] La respuesta del fetch NO fue exitosa. URL final:', response.url); // LOG 5
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
        console.error('[DEBUG] Error capturado en el bloque CATCH de loadView:', error); // LOG 6
>>>>>>> 3289b388955acde3b3e3f0db3241b8d35060cf72
        viewContainer.innerHTML = `<p class="text-center text-red-500">Error al cargar la página: ${error.message}</p>`;
    }
};

<<<<<<< HEAD
const navigateTo = (path) => {
    history.pushState(null, null, path);
    loadView(path);
};

=======
>>>>>>> 3289b388955acde3b3e3f0db3241b8d35060cf72
const buildMenu = () => {
    const nav = document.getElementById('main-nav');
    let menuHtml = '';

    menuConfig.forEach(item => {
        if (item.children) {
            menuHtml += `<div class="menu-category">
                            <span class="category-title">${item.name}</span>
                            <ul>`;
            item.children.forEach(child => {
<<<<<<< HEAD
                menuHtml += `<li><a href="${child.path}" class="nav-link">${child.name}</a></li>`;
            });
            menuHtml += `</ul></div>`;
        } else {
            menuHtml += `<ul><li><a href="${item.path}" class="nav-link single-link">${item.name}</a></li></ul>`;
        }
    });

=======
                menuHtml += `<li><a href="#${child.path}" class="nav-link">${child.name}</a></li>`;
            });
            menuHtml += `</ul></div>`;
        } else {
            menuHtml += `<ul><li><a href="#${item.path}" class="nav-link single-link">${item.name}</a></li></ul>`;
        }
    });
>>>>>>> 3289b388955acde3b3e3f0db3241b8d35060cf72
    nav.innerHTML = menuHtml;
};

export const initRouter = () => {
    buildMenu();
    
<<<<<<< HEAD
    window.addEventListener('popstate', () => loadView(location.pathname));

    document.body.addEventListener('click', e => {
        if (e.target.matches('.nav-link')) {
            e.preventDefault();
            navigateTo(e.target.getAttribute('href'));
        }
    });

    // Cargar la vista inicial
    loadView(location.pathname === '/' ? '/' : location.pathname);
=======
    window.addEventListener('hashchange', loadView);
    
    if (!location.hash) {
        location.hash = '#/';
    } else {
        loadView();
    }
>>>>>>> 3289b388955acde3b3e3f0db3241b8d35060cf72
};