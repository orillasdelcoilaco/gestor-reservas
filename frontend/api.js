// frontend/api.js - CÓDIGO CORREGIDO

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
    throw new Error('No autenticado');
  }

  // --- INICIO DE LA CORRECCIÓN ---
  const isFormData = options.body instanceof FormData;

  const headers = {
    // Solo añadimos Content-Type si NO es un FormData.
    // El navegador lo añadirá automáticamente con el boundary correcto para los archivos.
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  // Si no es FormData, convertimos el cuerpo a JSON. Si lo es, lo dejamos como está.
  const body = isFormData ? options.body : JSON.stringify(options.body);
  // --- FIN DE LA CORRECCIÓN ---


  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      body, // Usamos el cuerpo que preparamos
    });

    if (response.status === 401) {
      console.error('Token inválido o expirado. Redirigiendo al login.');
      logout();
      throw new Error('No autorizado');
    }

    if (!response.ok) {
      const errorResult = await response.json().catch(() => ({ error: 'Error desconocido del servidor' }));
      throw new Error(errorResult.error || `Error en la solicitud: ${response.statusText}`);
    }

    if (response.status === 204) {
        return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`Error en fetchAPI para el endpoint ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Verifica si el usuario tiene una sesión activa. Si no, lo redirige al login.
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