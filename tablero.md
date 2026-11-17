# Tablero — Gestor de Reservas

No había `leer-primero` ni tablero en este repo. Este archivo es el tablero del gestor.

| Tema | Estado | Nota |
|------|--------|------|
| Modificación de estadía desde Rezerva | Código listo para deploy | 2026-11-17. `POST /api/puente-sodc/modificacion` actualiza fechas y noches de la reserva y no reenvía el alta. No toca `valorCLP` ni abonos. Un cambio de fechas en el gestor avisa a Rezerva con `manual: true`. El reintento no. |
| Proyección anual — compartido con Rezerva `SM-proyeccion-anual` | Referencia. Sin turno de código en el gestor | 2026-11-17. Rezerva va a copiar la función del dashboard (`backend/frontend/dashboard.html` + `GET /api/kpi/proyeccion-anual` en `backend/routes/kpi.js`) a su dashboard. Este repo no se edita para eso. El fallback que nombra «Cabaña 2» se queda aquí; Rezerva usa el promedio de los alojamientos con historial. Plan: repo Rezerva `TASKS/tema/SM-proyeccion-anual/plan-accion-proyeccion-anual.md`. Aviso: `TASKS/coordinacion-cursor-gr.md` §8 de Rezerva. |
| Reportes rápidos — actividad diaria no muestra reservas del puente Rezerva | Corregido en datos y en código (falta deploy) | 2026-11-13. El alta de Rezerva guardaba el nombre público (`Cabaña 10 con Tinaja en Pucón para 8`) y el reporte compara con `Cabaña 10`. Fin de semana: `ssr-12112026-001`, Luis Guillermo González, Cabaña 10, 14–15 nov, ya queda como llegada el 14 y salida el 15. No hay una segunda confirmada ese fin de semana. Roberto (Booking `6029182609`, Cabaña 3) llega el lunes 16. |
