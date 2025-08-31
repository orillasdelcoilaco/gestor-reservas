# Plan de Desarrollo: Gestor de Reservas
Este documento describe la arquitectura y el estado actual del desarrollo de la aplicación de gestión de reservas, que migra la lógica desde una hoja de cálculo a una aplicación web con backend en Node.js y frontend en HTML/JavaScript.

## Estado Actual del Proyecto
El proyecto se encuentra en una fase funcional y estable.

## Próximos Pasos: Plan de Acción

### Etapa 1: Historial de Tarifas por Canal (✅ Completada)
### Etapa 2: Dashboard de KPIs (✅ Completada)
### Etapa 3: Panel de Gestión Diaria (✅ Completada)
### Etapa 4: Gestión de Cabañas y Base de Presupuestos (✅ Completada)
### Etapa 5: Generador de Presupuestos Avanzado (✅ Completada)
### Etapa 6: Presupuestos Avanzados: Filtros, Email y Branding (Próximo Desarrollo)

**Objetivo:** Añadir funcionalidades avanzadas al generador de presupuestos, como filtros de exclusión, envío directo por correo electrónico e inclusión de la marca del complejo.

* **Paso 6.1 (Modelo de Datos Detallado para Cabañas):**
    * **Acción:** Se modificará la colección `cabanas` y la página `gestion-cabanas.html`. El campo de texto `camas` se reemplazará por una estructura de datos más detallada (ej: `{ matrimoniales: 1, plazaYMedia: 2, camarotes: 1 }`). Esto es esencial para el cálculo de capacidad dinámica.

* **Paso 6.2 (Lógica de Presupuesto con Filtros - Backend):**
    * **Acción:** Se actualizará el `presupuestoService`. La lógica para sugerir cabañas (`findBestCombination`) se modificará para aceptar un filtro "sinCamarotes".
    * **Lógica Clave:** Si el filtro está activo, el servicio calculará una capacidad temporal para cada cabaña (`capacidadSinCamarotes = (camasMatrimoniales * 2) + camasPlazaYMedia + camarotes`). Se considera que cada camarote aporta 1 persona (la litera de abajo).

* **Paso 6.3 (Interfaz de Presupuestos Mejorada - Frontend):**
    * **Acción:** Se modificará la página `presupuestos.html`.
    * **Nuevos Elementos:**
        * Se añadirá un checkbox "Sin Camarotes" cerca de los selectores de fecha/personas.
        * El campo de email del cliente permitirá ingresar múltiples correos separados por punto y coma (;).
        * Se añadirá un nuevo botón: "Enviar por Email".
    * **Lógica de Texto:** La función `generatePresupuestoText` se actualizará para añadir una nota de observación si el filtro "Sin Camarotes" está activo, explicando por qué la selección de cabañas puede ser diferente.

* **Paso 6.4 (Implementación de Envío de Email con `mailto`):**
    * **Backend:** No se requieren cambios. La lógica se manejará en el lado del cliente.
    * **Frontend (`presupuestos.html`):** El botón "Enviar por Email" ejecutará una función que:
        * Leerá los correos del campo de email, separándolos por `;`.
        * Creará un asunto predefinido (ej: "Presupuesto de Alojamiento - Orillas del Coilaco").
        * Tomará el cuerpo del presupuesto desde el área de texto.
        * **Integración del Logo:** Dado que `mailto` no soporta HTML ni imágenes incrustadas, se añadirá un enlace a una versión pública de la imagen del logo al principio del cuerpo del correo. La mayoría de los clientes de correo modernos mostrarán este enlace como una imagen.
        * Construirá y activará un enlace `mailto:` que abrirá la aplicación de correo predeterminada del usuario con todos los campos ya rellenados.

---

### **Funcionalidades Implementadas Recientemente**

* **Ajuste Automático de Valor de Reserva:**
    * **Problema:** Al sincronizar reportes nuevos, los valores de reservas que habían sido ajustados manualmente en el sistema podían ser sobrescritos si la tarifa en el sistema de origen había cambiado.
    * **Solución:** Se implementó una lógica en el panel de **Gestión Diaria**. Al registrar el **pago final** de una reserva, el sistema ahora verifica si el total abonado por el cliente es mayor al valor registrado. Si lo es, actualiza automáticamente el valor de la reserva para que coincida con el total pagado y le asigna una bandera `valorManual: true`. El proceso de consolidación de reportes respeta esta bandera, evitando que los valores corregidos manualmente sean sobrescritos.

* **Herramienta de Ajuste de Tarifa para KPIs Precisos:**
    * **Problema:** Los reportes de canales como Booking entregan el precio final con descuentos ya aplicados, mientras que otros canales como SODC entregan el precio de lista. Esto impedía calcular correctamente el "Ingreso Potencial" y los descuentos reales en el Dashboard de KPIs.
    * **Solución:** Se añadió una **calculadora de ajuste de tarifa** en el panel de **Gestión Diaria**. Esta herramienta permite al operador ajustar el valor de cada reserva de dos maneras:
        1.  **Por Porcentaje de Descuento (Ideal para Booking):** Se ingresa el % de descuento total y el sistema calcula hacia atrás el precio original (potencial).
        2.  **Por Valor Final Pagado (Ideal para SODC):** Se ingresa el monto final que pagó el cliente y el sistema calcula el descuento aplicado.
    * **Resultado:** Cada reserva ahora almacena el `valorCLP` (real) y el `valorPotencialCLP` (tarifa), lo que permite al Dashboard de KPIs mostrar cifras de ingresos y descuentos 100% precisas.

---

### **Funcionalidades Futuras (Plan Original - Pendientes)**
* Actualización de Contactos (Generación de CSV).
* Sincronización con Google Calendar.
* Reporte Operacional Diario.
* Gestión de Leads y Creación Manual de Reservas.
* API de FAQs.