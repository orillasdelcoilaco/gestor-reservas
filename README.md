# Gestor de Reservas - Orillas del Coilaco

Este documento describe la arquitectura y el estado actual del desarrollo de la aplicación de gestión de reservas, una aplicación web completa que migra y automatiza la lógica desde una hoja de cálculo a una plataforma centralizada.

## Estado Actual del Proyecto

El proyecto se encuentra en una fase funcional y estable. Las funcionalidades clave de sincronización, consolidación, gestión y análisis están implementadas y operativas para los canales de **Booking, SODC y Airbnb**. Se han añadido herramientas de mantenimiento para garantizar la integridad de los datos y se ha mejorado la interfaz de gestión de clientes.

---

## Funcionalidades Clave Implementadas

El sistema está compuesto por varios módulos que trabajan en conjunto para ofrecer una solución de gestión integral:

* **Consolidación Multicanal**:
    * **Sincronización con Google Drive**: Busca y descarga automáticamente los reportes más recientes de Booking, SODC y Airbnb desde una carpeta designada.
    * **Procesamiento Inteligente**: Consolida los datos crudos, limpiando, estandarizando y convirtiendo monedas (USD a CLP para Booking) según sea necesario.
    * **Lógica de "Autosanación"**: El proceso de consolidación es capaz de corregir datos incorrectos en registros existentes (ej. nombres de cabañas de Airbnb) y añadir información faltante (ej. estado de gestión inicial) para mantener la consistencia de la base de datos.

* **Panel de Gestión Diaria (`gestion.html`)**:
    * **Centro de Tareas**: Muestra las reservas que requieren acción, priorizadas por fecha de llegada y urgencia del estado de gestión.
    * **Flujo de Estados**: Guía cada reserva a través de un ciclo de vida operativo (`Pendiente Bienvenida` -> `Pendiente Cobro` -> `Pendiente Pago` -> `Pendiente Boleta` -> `Facturado`).
    * **Herramientas Financieras**: Permite registrar pagos, ajustar tarifas, calcular valores potenciales para KPIs y distribuir montos en reservas grupales.
    * **Reversión de Estados**: Incluye una funcionalidad para revertir el estado de una reserva a una etapa anterior en caso de error.

* **Gestión de Clientes y CRM (`clientes.html`)**:
    * **Base de Datos Centralizada**: Ofrece una vista completa de todos los clientes, con estadísticas clave como el total de reservas y el primer canal de contacto.
    * **Edición Avanzada**: Un modal permite editar todos los datos del cliente (nombre, contacto, origen, fuente, calificación con estrellas) y muestra su historial de reservas completo.
    * **Sincronización con Google Contacts**: Integra un sistema de creación y actualización de contactos en Google. La lógica es capaz de actualizar un contacto existente si se corrige información (ej. un teléfono genérico por uno real).

* **Dashboard de KPIs (`dashboard.html`)**:
    * **Análisis de Rendimiento**: Calcula y muestra métricas clave (Ocupación, ADR, RevPAR, Ingreso Real vs. Potencial) para cualquier rango de fechas.
    * **Visualización de Datos**: Incluye gráficos de distribución por canal y un ranking de rendimiento por cabaña.
    * **Herramientas de Mantenimiento**: Proporciona botones para ejecutar procesos de reparación de datos únicos, como corregir estados de gestión o teléfonos faltantes en reservas antiguas.

* **Generador de Presupuestos (`presupuestos.html`)**:
    * **Sugerencia Inteligente**: Basado en fechas y número de personas, sugiere la combinación óptima de cabañas disponibles.
    * **Personalización**: Permite modificar la selección de cabañas y recalcular el precio al instante.
    * **Comunicación Rápida**: Genera un texto de presupuesto completo y formateado, listo para ser copiado o enviado por email.

---

## Plan de Acción

* **Etapa 1: Historial de Tarifas por Canal** (✅ Completada)
* **Etapa 2: Dashboard de KPIs** (✅ Completada)
* **Etapa 3: Panel de Gestión Diaria** (✅ Completada)
* **Etapa 4: Gestión de Cabañas y Base de Presupuestos** (✅ Completada)
* **Etapa 5: Generador de Presupuestos Avanzado** (✅ Completada)
* **Etapa 6: Integración de Airbnb y Robustecimiento del Sistema** (✅ Completada)
* **Etapa 7: Mejoras en la Gestión de Clientes** (✅ Completada)

### Próximo Desarrollo

**Objetivo:** Mejorar la lógica de creación de clientes para evitar duplicados y enriquecer la gestión de presupuestos.

* **Paso 1 (Lógica de Desduplicación de Clientes):**
    * **Acción:** Mejorar el `consolidationService`. Al procesar una nueva reserva, el sistema no solo buscará clientes por teléfono, sino que también considerará el nombre y/o email para identificar y fusionar posibles duplicados (ej. `Matias Perez (5699...)` y `Matias Perez (N/A)`).

* **Paso 2 (Presupuestos Avanzados: Filtros y Branding):**
    * **Acción:** Modificar `presupuestos.html` y su servicio asociado.
    * **Nuevos Elementos:**
        * Añadir un checkbox "Sin Camarotes" para recalcular la capacidad de las cabañas dinámicamente.
        * Integrar un enlace al logo de la empresa en el texto del presupuesto para mejorar la imagen de marca.