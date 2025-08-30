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

Etapa 1: Historial de Tarifas por Canal (✅ Completada)
Objetivo: Construir el sistema que permite registrar y gestionar las tarifas de las cabañas a lo largo del tiempo, detalladas por canal de venta.

Etapa 2: Dashboard de KPIs (✅ Completada)
Objetivo: Crear el dashboard dinámico para analizar el rendimiento del negocio en cualquier rango de fechas.

Etapa 3: Panel de Gestión Diaria (✅ Completada)
Objetivo: Crear el centro de operaciones para gestionar el ciclo de vida completo de cada reserva, desde el primer contacto hasta la facturación final.

Etapa 4: Gestión de Cabañas y Base de Presupuestos (✅ Completada)
Objetivo: Centralizar la información de las cabañas y crear la lógica inicial para la generación de presupuestos.

Paso 4.1 (Backend - Modelo de Datos): Se ha creado la colección cabanas y el documento complejo para almacenar la información de manera dinámica.

Paso 4.2 (Backend - API y Servicios): Se han implementado las rutas y servicios para el CRUD de cabañas y la lógica inicial de cálculo de presupuestos (disponibilidad, combinación de cabañas y precios).

Paso 4.3 (Frontend - Interfaz): Se han creado las páginas gestion-cabanas.html para administrar las cabañas y presupuestos.html para generar propuestas automáticas y permitir la modificación manual.

Etapa 5: Generador de Presupuestos Avanzado (Próximo Desarrollo)
Objetivo: Evolucionar la herramienta de presupuestos para que sea un sistema completo de cotización y seguimiento, integrando la gestión de clientes y generando un resultado profesional.

Paso 5.1 (Integración con Clientes):

Backend: Se ampliará la API de presupuestos.js para que pueda recibir un clienteId o los datos para crear un nuevo cliente junto con la solicitud de presupuesto.

Frontend (presupuestos.html): Se añadirá una sección para buscar un cliente existente por nombre o teléfono, o para ingresar los datos de un cliente nuevo directamente en la interfaz del presupuesto.

Paso 5.2 (Formato de Presupuesto Profesional):

Backend: El servicio de presupuestos se mejorará para obtener datos adicionales del complejo (ej: servicios, políticas de cancelación, ubicación) desde el documento de configuración.

Frontend (presupuestos.html): La función generatePresupuestoText será reescrita por completo para generar un texto con el formato profesional solicitado, incluyendo:

Encabezado con logo y datos de contacto.

Detalles del cliente.

Desglose detallado por cabaña con descripción, capacidad, valor por noche y total.

Resumen del presupuesto.

Inclusiones y condiciones de la reserva.

Pie de página con información de contacto.

Paso 5.3 (Guardado y Seguimiento de Presupuestos):

Backend: Se implementará la lógica para guardar el presupuesto generado en la nueva colección presupuestos, almacenando el cliente, fechas, cabañas, valor total, fecha de envío y un estado inicial ("Enviado").

Frontend (presupuestos.html): Se activará el botón "Guardar Presupuesto" para que, una vez generado el texto, se pueda enviar la cotización a la base de datos con un solo clic.

Funcionalidades Futuras (Plan Original - Pendientes)
Actualización de Contactos (Generación de CSV).

Sincronización con Google Calendar.

Reporte Operacional Diario.

Gestión de Leads y Creación Manual de Reservas.

API de FAQs.