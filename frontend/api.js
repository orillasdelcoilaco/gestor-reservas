// frontend/api.js

const API_BASE_URL = 'https://gestor-reservas.onrender.com';

export async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem('firebaseIdToken');
    if (!token) {
        console.error('No hay token de autenticación. Redirigiendo al login.');
        logout();
        throw new Error('No autenticado');
    }

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        if (options.body) {
            options.body = JSON.stringify(options.body);
        }
    }
    
    const url = `${API_BASE_URL}${endpoint}`;

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            logout();
            throw new Error('Sesión expirada o inválida.');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.error || errorData.message || 'Error en la petición a la API');
        }
        
        if (response.status === 204) {
            return { success: true, message: 'Operación completada con éxito.' };
        }

        return await response.json();
    } catch (error) {
        console.error(`Error en fetchAPI para el endpoint ${endpoint}:`, error);
        throw error;
    }
}

export function checkSession() {
    const token = localStorage.getItem('firebaseIdToken');
    const userEmail = sessionStorage.getItem('userEmail');

    if (!token || !userEmail) {
        window.location.href = 'index.html';
        return null;
    }
    return { token, userEmail };
}

export function logout() {
    localStorage.removeItem('firebaseIdToken');
    sessionStorage.removeItem('userEmail');
    window.location.href = 'index.html';
}