# Estado de Cierre y Verificación QA — Frontend y Backend (`Test ERP.xlsx`)

Actualizado: 20 de octubre de 2026.

## Resumen de correcciones completadas y verificadas

Todos los puntos documentados en `Test ERP.xlsx` fueron implementados y verificados con pruebas automatizadas:

1. **Interfaz, menús con zoom y navegación móvil (`BUG-003`, `BUG-004`):**
   - Posicionamiento dinámico y scroll interno en desplegables (`Select`) a 100%, 125%, 150% y 175% de zoom.
   - Menú lateral móvil (`Sheet`) con alto contraste sobre fondo azul oscuro, tarjeta de perfil, botón explícito para contraer el menú y botón de cerrar sesión siempre accesible.
2. **Guardado de PDF de remisiones en OneDrive (`BUG-005`, `TC-006`):**
   - Generación y subida directa del PDF de la remisión activa desde `/remisiones/:id` a Microsoft OneDrive mediante `/functions/v1/onedrive` (`pdf_remision: true`), sin redirigir engañosamente a `/documentos`.
3. **Inventario, Kardex y Administración de Productos (`BUG-001`, `BUG-002`, `BUG-006`, `TC-002`, `TC-003`):**
   - Validación y normalización numérica en entradas y ajustes (incluyendo conteo físico en `0` y ajustes de auditoría sin diferencia).
   - Botones explícitos de **+ Entrada**, **Ajustar** y **Kardex** en `/inventario` y `/inventario/:id`.
   - Creación, edición, activación/desactivación y eliminación condicional (o desactivación lógica cuando hay historial en `kardex` o `detalles_remision`).
4. **Cartera, Administración de Clientes y Edición de Abonos (`BUG-007`, `BUG-008`, `BUG-009`, `TC-004`, `TC-005`):**
   - Acceso visible a administración de clientes, prevención de duplicados, activación/desactivación rápida y eliminación condicional segura.
   - Botón de navegación rotulado explícitamente (**Ver detalle →**).
   - Edición controlada de abonos (`EditarAbono.tsx` + RPC `editar_abono_cartera` en migración `007`) con recálculo atómico de saldo y trazabilidad.
5. **Finanzas y Gastos (`BUG-010`, `TC-007`, `TC-008`):**
   - Edición y eliminación de gastos con confirmación previa, control de concurrencia y recálculo inmediato del total gastado y del saldo disponible del presupuesto.
6. **Documentos y OneDrive (`BUG-011`, `BUG-012`, `TC-009`, `TC-010`):**
   - Botón **«Subir documento»** al inicio de la página y tarjetas móviles responsivas.
   - Eliminación real en Microsoft OneDrive y base de datos (`action: "delete"`), con protección automática para documentos vinculados a remisiones o de tipo `'FACTURA_DIAN'`.

## Resultado de la Suite de Pruebas Automatizadas

- `npm run build` (`tsc --noEmit && vite build`): **0 errores**.
- `npx playwright test`: **111/111 pruebas E2E aprobadas**.
- `node --test tests/onedrive-backend.mjs`: **10/10 pruebas unitarias del backend OneDrive aprobadas**.

## Pasos operativos para despliegue en producción (Supabase / Vercel)

1. Aplicar en Supabase SQL Editor las migraciones pendientes si aún no se han ejecutado en el entorno productivo:
   - `database/migrations/005_entradas_y_ajustes_inventario.sql`
   - `database/migrations/006_onedrive_empresa.sql`
   - `database/migrations/007_editar_abono_cartera.sql`
2. Desplegar la función empresarial actualizada:
   - `supabase functions deploy onedrive`
3. Publicar el frontend desde `frontend/` en Vercel.
