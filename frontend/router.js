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
            { name: 'Autorizar Google Contacts', path: '/autorizar', id: 'autorizar' }
        ]
    }
];

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
        viewContainer.innerHTML = `<p class="text-center text-red-500">Error al cargar la página: ${error.message}</p>`;
    }
};

const navigateTo = (path) => {
    history.pushState(null, null, path);
    loadView(path);
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
                menuHtml += `<li><a href="${child.path}" class="nav-link">${child.name}</a></li>`;
            });
            menuHtml += `</ul></div>`;
        } else {
            menuHtml += `<ul><li><a href="${item.path}" class="nav-link single-link">${item.name}</a></li></ul>`;
        }
    });

    nav.innerHTML = menuHtml;
};

export const initRouter = () => {
    buildMenu();
    
    window.addEventListener('popstate', () => loadView(location.pathname));

    document.body.addEventListener('click', e => {
        if (e.target.matches('.nav-link')) {
            e.preventDefault();
            navigateTo(e.target.getAttribute('href'));
        }
    });

    // Cargar la vista inicial
    loadView(location.pathname === '/' ? '/' : location.pathname);
};