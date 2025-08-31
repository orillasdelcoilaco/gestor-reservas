Plan de Desarrollo: Gestor de Reservas
Este documento describe la arquitectura y el estado actual del desarrollo de la aplicación de gestión de reservas, que migra la lógica desde una hoja de cálculo a una aplicación web con backend en Node.js y frontend en HTML/JavaScript.

Estado Actual del Proyecto
El proyecto se encuentra en una fase funcional y estable, con las siguientes fases ya completadas:

✅ Fase 1: Sincronización Automática y Carga de Datos

✅ Fase 2: Consolidación y Limpieza de Datos

✅ Fase 3: Visualización y Herramientas Principales

Próximos Pasos: Plan de Acción
A continuación se detalla el plan para las próximas funcionalidades.

Etapa 1: Historial de Tarifas por Canal (✅ Completada)
Etapa 2: Dashboard de KPIs (✅ Completada)
Etapa 3: Panel de Gestión Diaria (✅ Completada)
Etapa 4: Gestión de Cabañas y Base de Presupuestos (✅ Completada)
Etapa 5: Generador de Presupuestos Avanzado (✅ Completada)
Objetivo: Evolucionar la herramienta de presupuestos a un sistema completo de cotización y seguimiento, integrando la gestión de clientes y generando un resultado profesional.

Paso 5.1 (Integración con Clientes): Se ha añadido la funcionalidad para buscar clientes existentes o crear nuevos desde la interfaz de presupuestos.

Paso 5.2 (Formato de Presupuesto Profesional): La herramienta ahora genera un texto con un formato detallado y profesional.

Paso 5.3 (Guardado y Seguimiento de Presupuestos): Se ha implementado la lógica para guardar los presupuestos generados en la base de datos para su posterior seguimiento.

Etapa 6: Presupuestos Avanzados: Filtros, Email y Branding (Próximo Desarrollo)
Objetivo: Añadir funcionalidades avanzadas al generador de presupuestos, como filtros de exclusión, envío directo por correo electrónico e inclusión de la marca del complejo.

Paso 6.1 (Modelo de Datos Detallado para Cabañas):

Acción: Se modificará la colección cabanas y la página gestion-cabanas.html. El campo de texto camas se reemplazará por una estructura de datos más detallada (ej: { matrimoniales: 1, plazaYMedia: 2, camarotes: 1 }). Esto es esencial para el cálculo de capacidad dinámica.

Paso 6.2 (Lógica de Presupuesto con Filtros - Backend):

Acción: Se actualizará el presupuestoService. La lógica para sugerir cabañas (findBestCombination) se modificará para aceptar un filtro "sinCamarotes".

Lógica Clave: Si el filtro está activo, el servicio calculará una capacidad temporal para cada cabaña (capacidadSinCamarotes = (camasMatrimoniales * 2) + camasPlazaYMedia + camarotes). Se considera que cada camarote aporta 1 persona (la litera de abajo).

Paso 6.3 (Interfaz de Presupuestos Mejorada - Frontend):

Acción: Se modificará la página presupuestos.html.

Nuevos Elementos:

Se añadirá un checkbox "Sin Camarotes" cerca de los selectores de fecha/personas.

El campo de email del cliente permitirá ingresar múltiples correos separados por punto y coma (;).

Se añadirá un nuevo botón: "Enviar por Email".

Lógica de Texto: La función generatePresupuestoText se actualizará para añadir una nota de observación si el filtro "Sin Camarotes" está activo, explicando por qué la selección de cabañas puede ser diferente.

Paso 6.4 (Implementación de Envío de Email):

Backend: Se creará un nuevo emailService utilizando Nodemailer para enviar correos transaccionales. Se requerirá configurar credenciales de un proveedor de email (ej: Gmail, SendGrid) en el servidor. Se creará una nueva ruta, POST /api/presupuestos/enviar, que recibirá los detalles del presupuesto y los correos de destino.

Branding: Para incluir el logo, el emailService no enviará texto plano, sino un correo en formato HTML, permitiendo incrustar la imagen del logo, usar colores y un diseño más profesional.

Frontend: El nuevo botón "Enviar por Email" llamará a esta nueva ruta, enviando toda la información necesaria para construir y despachar el correo.

Funcionalidades Futuras (Plan Original - Pendientes)
Actualización de Contactos (Generación de CSV).

Sincronización con Google Calendar.

Reporte Operacional Diario.

Gestión de Leads y Creación Manual de Reservas.

API de FAQs.