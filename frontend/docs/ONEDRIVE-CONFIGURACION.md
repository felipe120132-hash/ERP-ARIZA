# Documentos / OneDrive — 15 de octubre de 2026

La implementación empresarial está terminada en código y pendiente de desplegar en Supabase por el equipo de backend. La conexión antigua en producción no activa por sí sola este módulo nuevo.

Guía vigente: [ONEDRIVE-DESPLIEGUE.md](ONEDRIVE-DESPLIEGUE.md). Sustituye las instrucciones anteriores de conexión por usuario/pestaña.

El frontend usa una sola cuenta de empresa, autorizada por ADMIN. Los tokens Microsoft se cifran en el servidor; el navegador solo recibe estado y resultados. Incluye carga, consulta paginada, filtros, descarga autenticada, asociación a cliente/remisión y preparación del PDF de remisión. Las subidas inciertas conservan su archivo y solicitud para recuperarse sin duplicados.

Pendiente operativo: revisar/aplicar migración 006, configurar ONEDRIVE_ENCRYPTION_KEY en Supabase Secrets, desplegar la función onedrive y retirar onedrive-auth/onedrive-refresh antiguos con las sustituciones incluidas. Después publicar frontend/ y autorizar la cuenta empresarial para hacer la prueba real conjunta. No se ha probado este SQL en la base desplegada ni se han subido documentos reales.

Producción: https://erp-ariza.vercel.app/onedrive/callback. Desarrollo: http://localhost:5173/onedrive/callback. Mantener esos retornos registrados en Azure. CLIENT_ID y CLIENT_SECRET pertenecen al servidor; VITE_ONEDRIVE_CLIENT_ID ya no es necesario en el frontend.
