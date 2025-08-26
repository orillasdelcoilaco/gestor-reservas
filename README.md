# Plan de Desarrollo: Gestor de Reservas

Este documento describe la arquitectura y el estado actual del desarrollo de la aplicación de gestión de reservas, que migra la lógica desde una hoja de cálculo a una aplicación web con backend en Node.js y frontend en HTML/JavaScript.

## Estado Actual del Proyecto

El proyecto se encuentra en una fase funcional y estable, con las siguientes fases ya completadas:

* **✅ Fase 1: Sincronización Automática y Carga de Datos**: El sistema se conecta a Google Drive, descarga los reportes de SODC (CSV) y Booking (XLSX), y los carga en Firestore.
* **✅ Fase 2: Consolidación y Limpieza de Datos**: La aplicación procesa los datos brutos, los limpia, convierte divisas (USD a CLP) y crea o actualiza los registros en las colecciones `clientes` y `reservas`.
* **✅ Fase 3 (Parcial): Visualización y Herramientas Principales**:
    * **Vista de Reservas y Clientes**: Completamente funcionales, con búsqueda, edición y paginación para mejorar el rendimiento.
    * **Generador de Mensajes**: Funcionalidad completa para crear mensajes de cobro y bienvenida, con plantillas personalizadas y lógica de divisas.
    * **Sincronización con Google Contacts**: La lógica para crear y actualizar contactos en Google es robusta, usando el ID de reserva para búsquedas y aplicando actualizaciones condicionales.

---

## Próximos Pasos: Plan de Acción

A continuación se detalla el plan para las próximas funcionalidades.

### Etapa 1: Implementar el Historial de Tarifas por Canal (Trabajo Actual)

**Objetivo**: Construir el sistema fundamental que nos permita registrar y gestionar las tarifas de las cabañas a lo largo del tiempo, detalladas por canal de venta. Esta es la base para el análisis de negocio.

* **Paso 1.1 (Backend - Modelo de Datos)**:
    * **Acción**: Crear una nueva colección en Firestore llamada `tarifas`.
    * **Estructura**: Cada documento guardará `nombreCabaña`, `fechaInicio`, `fechaTermino`, `temporada` y un objeto `tarifasPorCanal` con el precio y la moneda para SODC, Booking, Airbnb, etc.

* **Paso 1.2 (Backend & Frontend - Gestión de Tarifas)**:
    * **Acción**: Crear una API (`/api/tarifas`) y una nueva página (`tarifas.html`) para administrar este historial de precios.
    * **Resultado**: Una herramienta visual para cargar y mantener los precios oficiales del negocio.

### Etapa 2: Construir el Dashboard de KPIs con Análisis de Descuentos

**Objetivo**: Crear el dashboard dinámico para analizar el rendimiento del negocio en cualquier rango de fechas.

* **Paso 2.1 (Backend - El Cerebro `kpiService.js`)**:
    * **Acción**: Desarrollar el servicio que contendrá la lógica de cálculo.
    * **Lógica Clave**:
        1.  Recibirá un rango de fechas.
        2.  Consultará las **reservas reales** en ese período.
        3.  Para cada noche de cada reserva, buscará en el **historial de tarifas** el precio oficial que correspondía por `nombreCabaña`, `fecha` y `canal`.
        4.  Convertirá tarifas de USD a CLP usando el `dolarService`.
        5.  **Calculará Métricas Clave**: Ingreso Real vs. Potencial, Total de Descuentos por Canal, Tasa de Ocupación, ADR, RevPAR, etc.

* **Paso 2.2 (Backend & Frontend - Interfaz del Dashboard)**:
    * **Acción**: Modificar `dashboard.html` para añadir selectores de fecha y un botón "Calcular", y crear la API (`/api/kpi`) para conectar ambos.
    *