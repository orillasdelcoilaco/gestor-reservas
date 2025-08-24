// frontend/api.js - CÓDIGO CORREGIDO Y FINAL

const API_BASE_URL = 'https://gestor-reservas.onrender.com';

export async function fetchAPI(endpoint, options = {}) {
  const token = localStorage.getItem('firebaseIdToken');
  if (!token) {
    console.error('No se encontró token. Redirigiendo al login.');
    window.location.href = 'index.html';
    throw new Error('No autenticado');
  }

  const isFormData = options.body instanceof FormData;
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
  };

  // Si no es un archivo, añadimos la cabecera JSON. Si es un archivo, dejamos que el navegador la ponga.
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Preparamos la configuración para fetch, separando el cuerpo del resto.
  const config = {
      method: options.method || 'GET',
      headers: headers,
      // Si el cuerpo existe, lo añadimos. Si es JSON, lo convertimos. Si es FormData, lo pasamos directamente.
      ...(options.body && { body: isFormData ? options.body : JSON.stringify(options.body) })
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

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

export function checkSession() {
  const token = localStorage.getItem('firebaseIdToken');
  const userEmail = sessionStorage.getItem('userEmail');
  if (!token || !userEmail) {
    window.location.href = 'index.html';
    return null;
  }
  return { userEmail };
}

export function logout() {
  localStorage.removeItem('firebaseIdToken');
  sessionStorage.removeItem('userEmail');
  window.location.href = 'index.html';
}