Plan de Desarrollo: Gestor de Reservas
Este documento describe la arquitectura y el estado actual del desarrollo de la aplicación de gestión de reservas, que migra la lógica desde una hoja de cálculo a una aplicación web con backend en Node.js y frontend en HTML/JavaScript.

Estado Actual del Proyecto
El proyecto se encuentra en una fase funcional y estable, con las siguientes fases ya completadas:

✅ Fase 1: Sincronización Automática y Carga de Datos: El sistema se conecta a Google Drive, descarga los reportes de SODC (CSV) y Booking (XLSX), y los carga en Firestore.

✅ Fase 2: Consolidación y Limpieza de Datos: La aplicación procesa los datos brutos, los limpia, convierte divisas (USD a CLP) y crea o actualiza los registros en las colecciones clientes y reservas.

✅ Fase 3: Visualización y Herramientas Principales:

Vista de Reservas y Clientes: Completamente funcionales, con búsqueda, edición y paginación para mejorar el rendimiento.

Generador de Mensajes: Funcionalidad completa para crear mensajes de cobro y bienvenida, con plantillas personalizadas y lógica de divisas.

Sincronización con Google Contacts: La lógica para crear y actualizar contactos en Google es robusta, usando el ID de reserva para búsquedas y aplicando actualizaciones condicionales.

Próximos Pasos: Plan de Acción
A continuación se detalla el plan para las próximas funcionalidades.

Etapa 1: Implementar el Historial de Tarifas por Canal (✅ Completada)
Objetivo: Construir el sistema que permite registrar y gestionar las tarifas de las cabañas a lo largo del tiempo, detalladas por canal de venta. Esta es la base para el análisis de negocio.

Paso 1.1 (Backend - Modelo de Datos): Se creó la colección tarifas en Firestore con una estructura que guarda nombreCabaña, fechaInicio, fechaTermino, temporada y un objeto tarifasPorCanal.

Paso 1.2 (Backend & Frontend - Gestión de Tarifas): Se crearon la API (/api/tarifas) y la página (tarifas.html) que permiten Crear, Leer, Actualizar y Eliminar (CRUD) el historial de precios.

Etapa 2: Construir el Dashboard de KPIs con Análisis de Descuentos (✅ Completada)
Objetivo: Crear el dashboard dinámico para analizar el rendimiento del negocio en cualquier rango de fechas, distinguiendo claramente entre el análisis de descuentos y el ingreso potencial total.

Paso 2.1 (Backend - El Cerebro kpiService.js):

Acción: Se desarrolló el servicio que contiene la lógica de cálculo.

Lógica Clave:

Análisis de Descuentos (Por Cabaña y Canal): Se calcula sobre las noches realmente vendidas, comparando el Ingreso Real con el Ingreso Potencial de cada noche según el historial de tarifas.

KPIs Generales: Se calculan sobre todas las noches disponibles (ocupadas o no) para obtener métricas como Tasa de Ocupación, ADR, RevPAR, Ingreso Total Real y Ingreso Potencial Total.

Paso 2.2 (Backend & Frontend - Interfaz del Dashboard):

Acción: Se modificó dashboard.html para añadir selectores de fecha y un botón "Calcular", conectado a la API (/api/kpi).

Resultado: Un dashboard funcional para el análisis financiero y de ocupación.

Etapa 3: Panel de Gestión Diaria (✅ Completada)
Objetivo: Crear el centro de operaciones para gestionar el ciclo de vida completo de cada reserva, desde el primer contacto hasta la facturación final. Esta interfaz guía al usuario, priorizando tareas y centralizando la información y la documentación.

Paso 3.1 (Backend - Modelo de Datos Evolucionado): Se ha modificado la colección reservas para soportar el flujo de gestión detallado, añadiendo el campo estadoGestion, la subcolección transacciones y el objeto documentos.

Paso 3.2 (Backend - API de Gestión y Servicios): Se han construido los servicios y la ruta gestion.js para obtener las reservas pendientes con su priorización y para manejar las acciones del flujo (registrar pagos, subir documentos, etc.).

Paso 3.3 (Frontend - Interfaz de Gestión Diaria): Se ha creado la página gestion.html con las tarjetas de gestión dinámicas, modales contextuales para cada acción (pagos, documentos, boletas), un buscador integrado y navegación mejorada. La lógica está completa y funcional.

Etapa 4: Gestión de Cabañas y Generador de Presupuestos (Próximo Desarrollo)
Objetivo: Centralizar la información de las cabañas para que sea dinámica y utilizar estos datos para crear una herramienta de generación y seguimiento de presupuestos.

Paso 4.1 (Backend - Modelo de Datos):

Nueva Colección cabanas: Se creará una colección para almacenar los detalles de cada cabaña (capacidad, baños, piezas, tipo de camas, descripción, equipamiento como tinaja, parrilla, etc.) y un enlace a su página de fotos.

Nuevo Documento complejo: Se creará un documento único en una colección config (o similar) para guardar los servicios generales del complejo (piscina, quincho, gimnasio, etc.).

Nueva Colección presupuestos: Almacenará los presupuestos generados. Guardará datos del cliente, fechas, cabañas cotizadas, valor total, fecha de envío y un estado (ej: 'Enviado', 'Aceptado', 'Rechazado').

Paso 4.2 (Backend - API y Servicios):

CRUD para Cabañas: Se creará una nueva ruta y servicio (cabanas.js) para administrar la información de las cabañas (Crear, Leer, Actualizar, Eliminar).

Servicio de Presupuestos: Se desarrollará la lógica para:

Consultar la disponibilidad de cabañas cruzando con la colección reservas.

Proponer Combinación Óptima: Implementar un algoritmo que, dado un número de personas, sugiera la combinación de cabañas disponibles más eficiente para alojarlas sin exceder la capacidad individual de cada una.

Calcular el valor de la estadía consultando la colección tarifas para las fechas seleccionadas.

Consolidar toda la información (detalles de cabañas, servicios del complejo, precios) en un solo objeto.

CRUD para Presupuestos: Se creará una nueva ruta (presupuestos.js) para guardar, leer y actualizar el estado de los presupuestos generados.

Paso 4.3 (Frontend - Interfaz):

Nueva Página gestion-cabanas.html: Una interfaz para administrar los detalles de cada cabaña (añadir nuevas, editar existentes).

Nueva Página presupuestos.html: Será el centro de esta nueva funcionalidad. Permitirá:

Seleccionar fechas y cantidad de personas.

El sistema mostrará una propuesta automática de cabañas.

El usuario tendrá la opción de modificar la selección, añadiendo o quitando cabañas de la lista de disponibles para ajustar la cotización a necesidades específicas (ej: clientes que no quieren camarotes). El precio total se recalculará dinámicamente.

Generar un texto detallado y formateado listo para copiar, que incluirá: descripción de las cabañas seleccionadas, servicios del complejo, desglose de valores y total.

Guardar el presupuesto en la base de datos, asociándolo a un cliente nuevo o existente.

Funcionalidades Futuras (Plan Original - Pendientes)
Actualización de Contactos (Generación de CSV).

Sincronización con Google Calendar.

Reporte Operacional Diario.

Gestión de Leads y Creación Manual de Reservas.

API de FAQs.