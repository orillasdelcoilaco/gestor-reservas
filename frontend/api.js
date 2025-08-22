// frontend/api.js

// URL base de tu API en Render. Centralizarla aquí facilita cambios futuros.
const API_BASE_URL = 'https://gestor-reservas.onrender.com';

/**
 * Función reutilizable para hacer llamadas a tu API, incluyendo el token de autenticación.
 * @param {string} endpoint El endpoint de la API al que quieres llamar (ej. '/api/reservas').
 * @param {object} options Opciones adicionales para fetch (ej. method, body, etc.).
 * @returns {Promise<any>} La respuesta de la API en formato JSON.
 */
export async function fetchAPI(endpoint, options = {}) {
  const token = localStorage.getItem('firebaseIdToken');

  if (!token) {
    console.error('No se encontró token. Redirigiendo al login.');
    window.location.href = 'index.html';
    // Lanza un error para detener la ejecución del código que llamó a fetchAPI
    throw new Error('No autenticado');
  }

  // Prepara las cabeceras (headers) de la solicitud
  const headers = {
    'Content-Type': 'application/json',
    // Esta es la línea clave: envía el token al backend
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Si el token es inválido o expiró, el servidor devolverá 401
    if (response.status === 401) {
      console.error('Token inválido o expirado. Redirigiendo al login.');
      logout(); // Llama a la función de logout para limpiar todo
      throw new Error('No autorizado');
    }

    if (!response.ok) {
      const errorResult = await response.json().catch(() => ({ error: 'Error desconocido del servidor' }));
      throw new Error(errorResult.error || `Error en la solicitud: ${response.statusText}`);
    }

    // Si la respuesta no tiene contenido (ej. un 204 No Content), no intentes parsear JSON
    if (response.status === 204) {
        return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`Error en fetchAPI para el endpoint ${endpoint}:`, error);
    // Re-lanza el error para que la página que llama pueda manejarlo si es necesario
    throw error;
  }
}

/**
 * Verifica si el usuario tiene una sesión activa. Si no, lo redirige al login.
 * Reemplaza la lógica repetida en cada página.
 * @returns {object|null} Un objeto con el email del usuario si la sesión es válida, o null si no lo es.
 */
export function checkSession() {
  const token = localStorage.getItem('firebaseIdToken');
  const userEmail = sessionStorage.getItem('userEmail');

  if (!token || !userEmail) {
    window.location.href = 'index.html';
    return null;
  }
  return { userEmail };
}

/**
 * Cierra la sesión del usuario, limpiando el almacenamiento y redirigiendo al login.
 */
export function logout() {
  localStorage.removeItem('firebaseIdToken');
  sessionStorage.removeItem('userEmail');
  window.location.href = 'index.html';
}