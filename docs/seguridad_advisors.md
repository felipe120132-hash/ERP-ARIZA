# Decisiones del Security Advisor de Supabase — ArizaERP

Este documento registra y fundamenta las decisiones tomadas respecto a los avisos de seguridad emitidos por el **Security Advisor** de Supabase para el proyecto ArizaERP.

---

## 1. Tabla Resumen de Decisiones

| Objeto / Hallazgo | Decisión | Motivo / Justificación |
|---|---|---|
| `crear_remision` | **Aceptada** | Vía de escritura prevista por RPC; valida internamente perfil activo y sanitiza parámetros de entrada. La tabla base `remisiones` no tiene INSERT directo permitido vía RLS. |
| `registrar_abono` | **Aceptada** | Vía de escritura prevista por RPC para abonos a cartera; valida internamente cliente, monto > 0 y método de pago. La tabla base `abonos_cartera` no tiene INSERT directo vía RLS. |
| `registrar_movimiento_inventario` | **Aceptada** | Vía de escritura prevista por RPC; valida rol exclusivo `ADMIN` activo (`es_admin_activo()`), entrada y clave de idempotencia. La tabla `kardex` no tiene INSERT directo permitido vía RLS. |
| `anular_remision` | **Aceptada** | Valida rol `ADMIN` activo con guard estricto (`IS DISTINCT FROM 'ADMIN'`); probada exhaustivamente con pruebas negativas de usuario `VENDEDOR`. |
| `resumen_financiero_mensual` | **Aceptada** | Lee tablas restringidas por RLS; cuenta con guard `es_admin_activo()`. Un usuario `VENDEDOR` no obtiene datos de gastos ni utilidad. |
| `obtener_rol_actual` | **Aceptada** | Función auxiliar esencial en `search_path = public, pg_temp` utilizada activamente por 10 políticas RLS; revocar permisos de ejecución rompería el control de acceso en toda la base de datos. |
| `actualizar_pdf_remision` | **Aceptada** | Utilizada por el frontend (`remisionesService.ts`) para asociar el PDF generado en OneDrive. Desde la migración 009 exige perfil autenticado y activo, valida que `p_pdf_url` comience obligatoriamente por `https://` y no exceda 2048 caracteres. |
| `Leaked password protection` | **Riesgo Aceptado** | La funcionalidad nativa de detección de contraseñas filtradas (HaveIBeenPwned) requiere el plan Pro de Supabase; estamos operando bajo el plan Free con contraseñas seguras gestionadas por Supabase Auth. |
| `rls_enabled_no_policy` (`onedrive_*`) | **Intencional** | Las tablas internas de OneDrive (`onedrive_archivos`, `onedrive_empresa`, `onedrive_oauth`) implementan políticas explícitas de denegación total (`false`) para `authenticated` y `REVOKE ALL` para `anon, authenticated` (migración 008). Solo la Edge Function con `service_role` tiene acceso. |

---

## 2. Resultado Esperado del Security Advisor

- **Errores:** `0`
- **Infos:** `0`
- **Warnings justificados:** `8` (7 funciones RPC controladas + Leaked password protection)

Todas las funciones `SECURITY DEFINER` conservan explícitamente `SET search_path TO 'public', 'pg_temp'` para mitigar ataques de inyección de rutas (`search_path hijacking`).
