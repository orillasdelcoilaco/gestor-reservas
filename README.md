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

### Etapa 1: Implementar el Historial de Tarifas por Canal (✅ Completada)

**Objetivo**: Construir el sistema que permite registrar y gestionar las tarifas de las cabañas a lo largo del tiempo, detalladas por canal de venta. Esta es la base para el análisis de negocio.

* **Paso 1.1 (Backend - Modelo de Datos)**: Se creó la colección `tarifas` en Firestore con una estructura que guarda `nombreCabaña`, `fechaInicio`, `fechaTermino`, `temporada` y un objeto `tarifasPorCanal`.
* **Paso 1.2 (Backend & Frontend - Gestión de Tarifas)**: Se crearon la API (`/api/tarifas`) y la página (`tarifas.html`) que permiten Crear, Leer, Actualizar y Eliminar (CRUD) el historial de precios.

### Etapa 2: Construir el Dashboard de KPIs con Análisis de Descuentos (✅ Completada)

**Objetivo**: Crear el dashboard dinámico para analizar el rendimiento del negocio en cualquier rango de fechas, distinguiendo claramente entre el análisis de descuentos y el ingreso potencial total.

* **Paso 2.1 (Backend - El Cerebro `kpiService.js`)**:
    * **Acción**: Se desarrolló el servicio que contiene la lógica de cálculo.
    * **Lógica Clave**:
        1.  **Análisis de Descuentos (Por Cabaña y Canal)**: Se calcula sobre las noches realmente vendidas, comparando el `Ingreso Real` con el `Ingreso Potencial` de cada noche según el historial de tarifas.
        2.  **KPIs Generales**: Se calculan sobre todas las noches disponibles (ocupadas o no) para obtener métricas como `Tasa de Ocupación`, `ADR`, `RevPAR`, `Ingreso Total Real` y `Ingreso Potencial Total`.
* **Paso 2.2 (Backend & Frontend - Interfaz del Dashboard)**:
    * **Acción**: Se modificó `dashboard.html` para añadir selectores de fecha y un botón "Calcular", conectado a la API (`/api/kpi`).
    * **Resultado**: Un dashboard funcional para el análisis financiero y de ocupación.

### Etapa 3: Panel de Gestión Diaria (Próximo Desarrollo)

**Objetivo**: Crear el centro de operaciones para gestionar el ciclo de vida completo de cada reserva, desde el primer contacto hasta la facturación final. Esta interfaz guiará al usuario, priorizando tareas y centralizando la información y la documentación.

* **Paso 3.1 (Backend - Modelo de Datos Evolucionado)**: Se modificará la colección `reservas` para soportar el flujo de gestión detallado.
    * **Campo de Estado**: Se añadirá `estadoGestion` para rastrear la etapa del flujo (Ej: `Pendiente Bienvenida`, `Pendiente Cobro`, `Pendiente Pago`, `Pendiente Boleta`, `Facturado`).
    * **Subcolección de Transacciones**: Se creará una subcolección `transacciones` dentro de cada reserva para registrar múltiples abonos y pagos. Cada transacción guardará `monto`, `fecha`, `medioDePago`, `tipo` ("Abono" o "Pago Final") y `enlaceComprobante`.
    * **Campo de Documentos**: Se añadirá un objeto `documentos` para almacenar los enlaces de Google Drive a archivos clave como la boleta final.

* **Paso 3.2 (Backend - API de Gestión y Servicios)**: Se construirán los componentes lógicos para potenciar la nueva interfaz.
    * **Nuevo `driveService.js`**: Se ampliarán sus permisos y funciones para permitir la **creación de carpetas** (`Año/ID_Reserva`) y la **subida de archivos** (comprobantes, boletas).
    * **Nueva Ruta `gestion.js`**: Contendrá la lógica principal:
        1.  Un endpoint `GET /api/gestion/pendientes` que devolverá las reservas activas, **ordenadas por la prioridad operativa definida**: primero las que llegan hoy con pagos pendientes, luego las que necesitan boleta, etc.
        2.  Endpoints `POST` para registrar cada acción del flujo (marcar bienvenida enviada, registrar un pago en la subcolección `transacciones`, marcar boleta enviada).
    * **Mejora en `mensajes.js`**: El endpoint que obtiene los detalles de una reserva se actualizará para **sumar automáticamente todos los abonos** de la subcolección `transacciones`, entregando un campo `totalAbonado` para usar en las plantillas de mensajes.

* **Paso 3.3 (Frontend - Interfaz de Gestión Diaria)**: Se creará una nueva página `gestion.html`.
    * **Diseño**: Será un panel dinámico, no una tabla estática. Las reservas se mostrarán como "tarjetas de gestión", agrupadas por nivel de urgencia (Ej: "Requiere Acción Hoy", "Próximas Llegadas").
    * **Tarjeta de Gestión**: Cada tarjeta mostrará la información esencial para la acción: Nombre del cliente, teléfono, fechas, cabaña y N° de reserva.
    * **Flujo Guiado**: La tarjeta mostrará un estado claro (Ej: "PAGO PENDIENTE") y ofrecerá únicamente los **botones contextuales para la siguiente acción lógica** (Ej: "Registrar Pago").
    * **Interacción**: Las acciones como "Registrar Pago" abrirán ventanas modales para ingresar datos (monto, medio de pago) y subir el archivo correspondiente directamente a Google Drive.

### Funcionalidades Futuras (Plan Original - Pendientes)

* Actualización de Contactos (Generación de CSV).
* Sincronización con Google Calendar.
* Reporte Operacional Diario.
* Consulta de Disponibilidad.
* Gestión de Leads y Creación Manual de Reservas.
* API de FAQs.