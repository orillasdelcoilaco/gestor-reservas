# Instrucciones

Asume el rol de arquitecto de software experto en las tecnologías usadas en este proyecto.  
Recibirás un repositorio de GitHub. Primero analiza su estructura y el archivo README para entender objetivos, dependencias y flujo general.  

Asume el rol de arquitecto de software experto en las tecnologías usadas en este proyecto.  
Recibirás un repositorio de GitHub. Primero analiza su estructura y el archivo README para entender objetivos, dependencias y flujo general.  
Cuando te pida realizar modificaciones, deberás:  

1. Siempre devolver los archivos completos, nunca fragmentos.  
2. No agregar comentarios ni dentro de las funciones ni en el código ya existente.  
3. Mantener el estilo de código, convenciones y arquitectura ya usadas en el repositorio.  
4. Si hay múltiples formas de resolverlo, prioriza la más simple, clara y mantenible.  
5. Si debo modificar más de un archivo para que el cambio funcione, incluye todos los archivos necesarios en la respuesta.  
6. Si es necesario crear nuevos archivos, entrégalos completos.  
7. Antes de dar el código, explícame brevemente los cambios y por qué son necesarios.  
Cuando modifiques archivos existentes:
9. Si una función no requiere cambios, mantenla exactamente igual como en la versión anterior.  
   Nunca la reemplaces con “// ... (código existente)”.  
10. Si una función requiere cambios, entrégala completa con los cambios aplicados.  
11. Nunca borres lógica previa ni la resumas con comentarios de relleno.  
12. Mantén el estilo y la coherencia del código ya presente.

Mi objetivo es evolucionar el proyecto paso a paso, así que actúa como un **socio técnico** que me guía en decisiones de arquitectura y en la implementación.

Gestor de Reservas - Orillas del Coilaco
Este documento describe la arquitectura y el estado actual del desarrollo de la aplicación de gestión de reservas, una aplicación web completa que migra y automatiza la lógica desde una hoja de cálculo a una plataforma centralizada.

Estado Actual del Proyecto
El proyecto se encuentra en una fase funcional y estable. Las funcionalidades clave de sincronización, consolidación, gestión y análisis están implementadas y operativas para los canales de Booking, SODC y Airbnb. El generador de presupuestos está terminado y la gestión de clientes se considera una etapa cerrada. El foco actual está puesto en la optimización del dashboard y los KPIs.

Funcionalidades Clave Implementadas
El sistema está compuesto por varios módulos que trabajan en conjunto para ofrecer una solución de gestión integral:

Consolidación Multicanal:

Sincronización con Google Drive: Busca y descarga automáticamente los reportes más recientes de Booking, SODC y Airbnb desde una carpeta designada.

Procesamiento Inteligente: Consolida los datos crudos, limpiando, estandarizando y convirtiendo monedas (USD a CLP para Booking) según sea necesario.

Lógica de "Autosanación": El proceso de consolidación es capaz de corregir datos incorrectos en registros existentes y añadir información faltante para mantener la consistencia de la base de datos.

Panel de Gestión Diaria (gestion.html):

Centro de Tareas: Muestra las reservas que requieren acción, priorizadas por fecha de llegada y urgencia del estado de gestión.

Flujo de Estados: Guía cada reserva a través de un ciclo de vida operativo (Pendiente Bienvenida -> Pendiente Cobro -> Pendiente Pago -> Pendiente Boleta -> Facturado).

Herramientas Financieras: Permite registrar pagos, ajustar tarifas, calcular valores potenciales (valorPotencialCLP) para KPIs y distribuir montos en reservas grupales.

Gestión de Clientes y CRM (clientes.html):

Base de Datos Centralizada: Ofrece una vista completa de todos los clientes, con estadísticas clave como el total de reservas y el primer canal de contacto.

Sincronización con Google Contacts: Integra un sistema de creación y actualización de contactos en Google.

Dashboard de KPIs (dashboard.html):

Análisis de Rendimiento: Calcula y muestra métricas clave (Ocupación, ADR, RevPAR, Ingreso Real vs. Potencial) para cualquier rango de fechas.

Visualización de Datos: Incluye gráficos de distribución por canal y un ranking de rendimiento por cabaña.

Generador de Presupuestos (presupuestos.html):

Sugerencia Inteligente: Basado en fechas y número de personas, sugiere la combinación óptima de cabañas disponibles.

Personalización: Permite modificar la selección de cabañas, recalcular el precio y generar un texto formateado listo para ser enviado.

Instrucciones de Despliegue y Uso
Backend
Instalar dependencias: Navegar a la carpeta backend y ejecutar npm install.

Credenciales de Google/Firebase: Colocar los siguientes archivos de credenciales (obtenidos desde la consola de Google Cloud) en la raíz de la carpeta backend:

serviceAccountKey.json: Para la autenticación con Firebase Admin SDK.

oauth_credentials.json: Para la autenticación de OAuth 2.0 con la API de Google Contacts.

Iniciar el servidor: Ejecutar node index.js. El servidor se iniciará por defecto en http://localhost:3001.

Frontend
Configuración: Abrir el archivo frontend/api.js y asegurarse de que la constante API_BASE_URL apunte a la URL donde se está ejecutando el backend (ej. https://gestor-reservas.onrender.com o http://localhost:3001).

Despliegue: Los archivos del frontend (.html, .js) son estáticos. Pueden ser servidos por cualquier servidor web simple (como la extensión "Live Server" de VSCode para desarrollo local) o desplegados en una plataforma de hosting estático.

Plan de Acción
Etapa 1 a 7: (✅ Completadas)

Etapa 8: Optimización de KPIs y Dashboard (En progreso)


Paso 1 (Backend: Lógica de KPIs Avanzada en kpiService.js):

Ingreso Potencial (Proyección):

Modificar el cálculo para que lea la lista de cabañas activas directamente desde la colección cabanas de la base de datos.

Implementar una validación que detenga el cálculo y devuelva un error si no se encuentra una tarifa para una cabaña en un día requerido, asegurando la precisión de los datos (ej: "Falta tarifa para Cabaña 5 el 2024-02-15").

Añadir un parámetro para aceptar un porcentaje de ocupación que ajustará el ingreso potencial total según esta proyección.

Cálculo de Descuentos Reales:

Implementar una nueva lógica que, para cada reserva dentro del período seleccionado, calcule el descuento individual (valorPotencialCLP - valorCLP). El valorPotencialCLP se tomará del dato ya guardado en cada reserva desde el panel de gestión. Las reservas sin este dato tendrán un descuento de cero.

El KPI "Descuentos Totales" será la suma de todos estos descuentos individuales.

Análisis Granular por Cabaña:

Calcular y agrupar las noches ocupadas, las noches disponibles (y por ende, las "noches faltantes") y el total de descuentos por cada cabaña individual.

Preparar un desglose de estas métricas por canal (Booking, SODC, Airbnb) para cada cabaña.

Paso 2 (Frontend: Rediseño del Dashboard en dashboard.html):

Nuevo Control de Proyección: Añadir un campo de entrada para que el usuario pueda ingresar el porcentaje de ocupación proyectado (ej. 70%) que se usará para calcular el "Ingreso Potencial Total".

Tabla de Ranking Mejorada:

Añadir dos nuevas columnas: "Noches Faltantes" y "Descuento Total".

Implementar la funcionalidad para que al hacer clic en una fila de la tabla (una cabaña), se muestre un detalle con el desglose de noches y descuentos por cada canal.

Gráfico de Canales: Actualizar el gráfico para que muestre los valores porcentuales directamente sobre cada sección, facilitando su lectura.

El sistema está compuesto por un ecosistema de módulos que ofrecen una solución de gestión integral y robusta.

### 1. Sincronización de Datos Bidireccional

* **Sincronización de Entrada (Reportes):** El sistema se conecta a una carpeta designada en Google Drive para buscar y descargar automáticamente los reportes más recientes de **Booking, SODC y Airbnb**.
* **Sincronización de Salida (Disponibilidad iCal):** El gestor genera **URLs de calendario iCal únicas para cada cabaña**. Esto permite que sistemas externos (como el propio SODC/WordPress, Booking o Airbnb) se suscriban a estos calendarios para bloquear fechas automáticamente cuando se crea una reserva en el gestor, logrando una sincronización bidireccional de la disponibilidad.

### 2. Procesamiento y Consolidación Inteligente

* **Motor de Consolidación:** Procesa los datos crudos de los reportes, limpiando, estandarizando nombres, convirtiendo monedas (USD a CLP con valor histórico) y calculando valores.
* **Lógica Anti-Duplicados:** El sistema es idempotente. Si se vuelve a cargar un reporte antiguo, el sistema identifica las reservas ya existentes y las ignora para prevenir duplicados y proteger los datos ya gestionados.
* **Corrección de Identidad:** Permite corregir errores de canal o ID de reserva desde la interfaz. El sistema migra automáticamente todos los datos asociados (pagos, notas) a la nueva identidad y deja un registro de redireccionamiento para evitar conflictos futuros.

### 3. Flujo de Reservas Completo (Propuesta → Confirmación)

* **Agregar Propuesta:** Una herramienta de cotización que sugiere la combinación óptima de cabañas según la disponibilidad, fechas y número de personas. Es capaz de generar **itinerarios segmentados** (cambio de cabaña durante la estadía).
* **Gestionar Propuestas:** Un panel central para visualizar todas las propuestas pendientes. Desde aquí se pueden **Confirmar** (convirtiéndolas en reservas oficiales), **Cancelar** o **Rechazar**.
* **Bitácora de Rechazo:** Al rechazar una propuesta, el sistema solicita un motivo (Precio, No Abonado, etc.) y una nota, guardando un historial valioso para el análisis de ventas.

### 4. Gestión Operativa y CRM

* **Panel de Gestión Diaria:** El centro de operaciones de la aplicación. Muestra una lista priorizada de reservas que requieren una acción inmediata (Enviar Bienvenida, Enviar Cobro, Registrar Pago, Enviar Boleta).
* **Gestión de Clientes (CRM):** Una base de datos centralizada de clientes con historial de reservas, estadísticas y la capacidad de sincronizar contactos con **Google Contacts**.
* **Calendario de Ocupación:** Una vista de _timeline_ rápida y optimizada que muestra la ocupación de todas las cabañas, con reservas coloreadas por canal.

### 5. Análisis y Reportes

* **Dashboard de KPIs:** Un panel de análisis de rendimiento que calcula métricas clave para cualquier rango de fechas: **Tasa de Ocupación, ADR, RevPAR, Ingreso Real vs. Proyectado y Descuentos Reales**. Incluye un desglose por cabaña y por canal.
* **Reportes Rápidos:** Una herramienta para generar textos formateados y listos para copiar en WhatsApp:
    * **Reporte de Actividad Diaria:** Muestra las llegadas, salidas, estadías y próximas reservas para un día específico.
    * **Reporte de Disponibilidad:** Genera un resumen de las cabañas disponibles en un rango de fechas futuro, con sus precios y enlaces.

### 6. Herramientas de Configuración y Mantenimiento

* **Gestión de Cabañas:** Módulo para crear, editar y eliminar las propiedades, incluyendo detalles como capacidad, descripción y enlaces a fotos.
* **Gestión de Tarifas:** Interfaz para definir precios por temporada y por canal de venta.
* **Gestión del Valor del Dólar:** Módulo para cargar el historial de valores del dólar desde archivos CSV.

## Próximo Desarrollo: Rediseño de la Interfaz y Arquitectura del Frontend

Para mejorar la usabilidad y escalabilidad de la aplicación, se ha acordado un rediseño completo de la interfaz de usuario, basado en los siguientes principios arquitectónicos:

### 1. Arquitectura de "Contenedor" y Vistas Modulares

Se abandonará el modelo de múltiples páginas HTML independientes en favor de una arquitectura de tipo _Single-Page Application (SPA)_.

* **Contenedor Principal (`app.html`):** Existirá un único archivo principal que contendrá los elementos persistentes de la interfaz: la barra de navegación superior y un nuevo menú lateral.
* **Vistas Dinámicas:** El contenido de cada sección (KPIs, Calendario, Gestión de Clientes, etc.) se organizará en "vistas" o "componentes" modulares (archivos HTML y JS separados). Estas vistas se cargarán dinámicamente en el área de contenido principal del contenedor sin necesidad de recargar toda la página.

### 2. Navegación con Menú Lateral Responsivo

Se reemplazará la actual acumulación de botones en el dashboard por un menú de navegación lateral, organizado y lógico.

* **Diseño para Escritorio:**
    * El menú será visible por defecto en el lado izquierdo.
    * Se incluirá un botón para **colapsar** el menú, convirtiéndolo en una barra de íconos delgada para maximizar el espacio del área de contenido.
* **Diseño para Móviles:**
    * El menú estará **oculto por defecto** para no ocupar espacio en pantallas pequeñas.
    * Se mostrará un **ícono de "hamburguesa" (☰)** en la barra de navegación superior. Al tocarlo, el menú se deslizará para mostrar las opciones.

### 3. Nueva Estructura Lógica de Funcionalidades

Las herramientas se agruparán en el menú lateral bajo las siguientes categorías:

* **📊 DASHBOARD:**
    * Análisis de Rendimiento (KPIs).

* **⚙️ GESTIÓN OPERATIVA:**
    * Gestión Diaria.
    * Calendario de Ocupación.
    * Reportes Rápidos.

* **📈 VENTAS Y CLIENTES:**
    * Agregar Propuesta.
    * Gestionar Propuestas.
    * Gestionar Clientes.
    * Generar Mensajes.

* **🔄 SINCRONIZACIÓN:**
    * Sincronizar (Google Drive).
    * Procesar y Consolidar.
    * Sincronizar Calendarios (iCal).

* **🛠️ CONFIGURACIÓN:**
    * Gestionar Cabañas.
    * Gestionar Tarifas.
    * Gestionar Reservas (Vista de tabla completa).
    * Cargar Valor Dólar.
    * Autorizar Google Contacts.
    * Herramientas de Mantenimiento.

## Instrucciones de Despliegue y Uso

### Backend

1.  **Instalar dependencias:** Navegar a la carpeta `backend` y ejecutar `npm install`.
2.  **Credenciales de Google/Firebase:** Colocar los siguientes archivos de credenciales (obtenidos desde la consola de Google Cloud) en la raíz de la carpeta `backend`:
    * `serviceAccountKey.json`: Para la autenticación con Firebase Admin SDK.
    * `oauth_credentials.json`: Para la autenticación de OAuth 2.0 con la API de Google Contacts.
3.  **Iniciar el servidor:** Ejecutar `node index.js`. El servidor se iniciará por defecto en `http://localhost:3001`.

### Frontend

1.  **Configuración:** Abrir el archivo `frontend/api.js` y asegurarse de que la constante `API_BASE_URL` apunte a la URL donde se está ejecutando el backend (ej. `https://gestor-reservas.onrender.com` o `http://localhost:3001`).
2.  **Despliegue:** Los archivos del frontend (`.html`, `.js`) son estáticos. Pueden ser servidos por cualquier servidor web simple (como la extensión "Live Server" de VSCode para desarrollo local) o desplegados en una plataforma de hosting estático.