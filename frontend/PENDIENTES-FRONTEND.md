# Pendientes del frontend — cierre de primera fase

Actualizado: 4 de octubre de 2026.

## Ya implementado

Login y sesión; catálogo y carrito; creación y consulta de remisiones; PDF e impresión; interfaz de anulación para ADMIN; cartera e historial de clientes; registro de abonos; consulta de inventario y kardex; finanzas y registro de gastos; resumen de operación. Diseño adaptable y 47 pruebas de navegador con respuestas simuladas.

## Próxima fase, en orden sugerido

1. **Administración de clientes:** crear, editar, activar/desactivar y gestionar precios especiales por producto/cliente. Actualmente se consultan clientes y se registran abonos.
2. **Administración de productos:** crear, editar, activar/desactivar, cargar imágenes y configurar stock mínimo. Actualmente el catálogo es de consulta y permite preparar pedidos.
3. **Entradas y ajustes de inventario:** formularios, permisos y confirmaciones. Verificar primero que el backend ofrezca operaciones atómicas que actualicen stock y kardex juntos; no editar stock directamente desde el frontend.
4. **Documentos y OneDrive:** centro documental, autenticación Microsoft, callback, subida, asociación con cliente/remisión, consulta y recuperación de errores. Verificar configuración y despliegue de las Edge Functions. El PDF local ya funciona; aún no se sube ni se persiste su enlace.
5. **Presupuestos:** creación y edición del límite mensual para ADMIN. Hoy solo se consulta.
6. **Cierre de integración y despliegue:** ejecutar escenarios de escritura controlados en una base de pruebas, validar RLS/roles, revisar listas grandes y paginación del servidor, configurar despliegue SPA y variables públicas, y prueba final de escritorio/móvil.

## Dependencias del backend que siguen abiertas

- La migración `004_fix_null_role_checks.sql` ya está incluida en el remoto: corrige el guard ADMIN de anulación y la comparación con NULL de finanzas. Falta confirmar su aplicación en Supabase.
- `obtener_rol_actual()` aún no comprueba `perfiles.activo`: resolver el acceso por API de usuarios desactivados con sesión vigente.
- Probar las reversiones de stock, kardex y cartera al anular, en especial con abonos asociados/generales. Las definiciones de los triggers no están en el repositorio revisado. No se ejecutaron anulaciones reales.
- Idempotencia de ventas, abonos y gastos frente a reintentos y concurrencia entre dispositivos. Las protecciones del frontend no sustituyen esa garantía del backend.
- Para futuras cotizaciones definitivas antes de guardar, vencimientos o saldo por remisión, se necesita soporte explícito del contrato; no inferirlos en la interfaz.

## Retomar el proyecto

La aplicación completa se encuentra en `frontend/`; los servicios y documentos originales del backend se conservan en la raíz.

```sh
cd frontend
npm ci
# Copiar .env.example a .env.local y completar URL y clave pública de Supabase.
npm run dev
```

Validación: `npm run build`. Para `npm test`, mantener Vite en `http://127.0.0.1:5173` y tener Chrome instalado. Las pruebas interceptan Supabase. Confirmar ventas, abonos, gastos o anulaciones desde la aplicación normal sí modifica la base conectada.

No se incluyen credenciales, node_modules, dist, capturas de datos reales ni archivos temporales.
