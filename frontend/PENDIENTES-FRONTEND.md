# Pendientes del frontend — cierre de primera fase

Actualizado: 10 de octubre de 2026.

## Ya implementado

Login y sesión; catálogo y carrito; creación y consulta de remisiones; PDF e impresión; interfaz de anulación para ADMIN; cartera e historial de clientes; registro de abonos; consulta de inventario y kardex; finanzas y registro de gastos; resumen de operación. Administración de clientes y precios especiales implementada en la segunda entrega local. Identidad azul con logo de Distribuciones Ariza, alertas de mayor contraste, subtotal estimado sin IVA antes de confirmar y PDF con identidad de marca. Administración de productos e imágenes implementada localmente. Diseño adaptable y 70 pruebas de navegador con respuestas simuladas.

## Próxima fase, en orden sugerido

1. **Administración de clientes implementada localmente:** crear, editar, activar/desactivar y gestionar precios especiales por producto/cliente. Publicada en main y desplegada en Vercel. Pendiente validarla con escrituras controladas en una base de pruebas.
2. **Administración de productos e imágenes implementada localmente:** crear, editar, activar/desactivar, cargar o reemplazar fotos y configurar stock mínimo. Publicada en main y desplegada en Vercel. Pendiente validar escrituras y Storage en una base de pruebas. La limpieza de fotos antiguas o subidas sin asociar queda para mantenimiento controlado.
3. **Entradas y ajustes de inventario:** formulario de preparación y revisión implementado localmente; registro deshabilitado. El usuario indica que la función podría existir en Supabase. Supabase ya responde y las consultas de lectura fueron verificadas. OpenAPI está restringido a claves secretas: obtener del equipo la definición SQL de la operación atómica. Ver docs/INVENTARIO-CONTRATO-PENDIENTE.md. Falta conectar el envío, idempotencia y recuperación, y probar stock/kardex juntos.
4. **Documentos y OneDrive:** centro documental, autenticación Microsoft, callback, subida, asociación con cliente/remisión, consulta y recuperación de errores. Verificar configuración y despliegue de las Edge Functions. El PDF local ya funciona; aún no se sube ni se persiste su enlace.
5. **Presupuestos implementados localmente:** crear y editar límite mensual desde Finanzas para ADMIN, con revisión, detección de conflictos y recuperación de respuestas inciertas. Lectura real de presupuestos y resumen financiero verificada. Pendiente validar escrituras en una base de pruebas y publicar esta entrega.
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




## Actualización OneDrive — 10 de octubre de 2026

Callback e inicio de conexión implementados localmente. Pendiente: obtener VITE_ONEDRIVE_CLIENT_ID y VITE_ONEDRIVE_REDIRECT_URI, configurar Azure/Supabase/Vercel, publicar y probar autorización real. Después conectar subida, listado y asociación de documentos. Guía: docs/ONEDRIVE-CONFIGURACION.md.


## Actualización 14 de octubre de 2026 (sustituye el estado anterior)

Inventario: registro conectado localmente a la RPC desplegada; 17 pruebas simuladas y prueba real exclusiva sobre SKU-PRUEBA con stock final 15, dos movimientos en kardex. Falta comprobar VENDEDOR real y publicar estos cambios de interfaz. Ver docs/INVENTARIO-INTEGRACION.md.

OneDrive: valores públicos y consumers ya verificados en el build publicado; callback HTTP 200. Falta el contrato de cuenta empresarial con tokens en servidor y luego subida/listado/asociación. Ver docs/ONEDRIVE-CONFIGURACION.md. No se subieron documentos reales.

## Estado vigente — 15 de octubre de 2026

Documentos/OneDrive: implementación empresarial lista para publicar, incluyendo migración 006 y Edge Functions. Ya no falta escribir el contrato del servidor. Falta desplegarlo, configurar la clave de cifrado y verificar en staging/producción con la cuenta de la empresa. Ver docs/ONEDRIVE-DESPLIEGUE.md. No se han subido documentos reales. Siguen pendientes las comprobaciones reales de roles/RLS y los escenarios generales de integración indicados arriba.
