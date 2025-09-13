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
    '/autorizar': 'views/autorizar.html',
    '/mantenimiento': 'views/mantenimiento.html'
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

const resolveRoute = () => {
    // Con hash routing, la ruta es lo que viene después del '#'
    const path = location.hash.slice(1).toLowerCase() || '/';
    return path;
};

const loadView = async () => {
    const path = resolveRoute();
    const viewContainer = document.getElementById('view-content');
    viewContainer.innerHTML = '<p class="text-center text-gray-500">Cargando...</p>';
    
    const viewFile = routes[path] || 'views/404.html';
    
    try {
        const response = await fetch(viewFile);
        if (!response.ok) throw new Error('Página no encontrada (404)');
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
                // Los enlaces ahora apuntan a hashes
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
    
    // Escuchar cambios en el hash de la URL
    window.addEventListener('hashchange', loadView);
    
    // Si al cargar no hay un hash, lo establecemos a la ruta raíz para cargar el dashboard.
    if (!location.hash) {
        location.hash = '#/';
    } else {
        // Si ya hay un hash, cargamos la vista correspondiente.
        loadView();
    }
};