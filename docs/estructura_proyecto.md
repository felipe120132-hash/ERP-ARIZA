# Estructura y Comportamiento del Proyecto — ArizaERP

**Léelo primero.** Este documento explica cómo está armado el sistema y por qué, para que cualquier persona (o agente de IA) que trabaje en este repo entienda las reglas antes de tocar código. Los detalles exactos de cada tabla y cada endpoint están en los otros documentos de `docs/` — este archivo es el mapa que conecta todo.

---

## 1. La arquitectura en una frase

**React habla con Supabase (PostgREST, RPCs, Storage y Edge Functions). No hay servidor Node/Express intermedio.** El frontend llama a la API REST que PostgREST autogenera a partir del esquema de PostgreSQL, a funciones RPC transaccionales para la lógica de negocio, y a la Edge Function empresarial `/functions/v1/onedrive` para la integración con Microsoft Graph.

```
┌─────────────┐        supabase-js         ┌──────────────────────────────────┐
│   React     │ ───────────────────────────▶│  Supabase                        │
│ (frontend/) │                              │  - PostgREST (API REST)          │
│             │◀─────────────────────────────│  - PostgreSQL + RLS              │
└─────────────┘                              │  - Triggers + Funciones RPC      │
                                              │  - Edge Function (/onedrive)     │
                                              │  - Auth + Storage                │
                                              └──────────────────────────────────┘
```

Lo que cumple el rol de "Controlador" son tres piezas:
- **PostgREST**, para operaciones CRUD con políticas RLS y validaciones de concurrencia.
- **Las funciones RPC** (`crear_remision`, `registrar_abono`, `editar_abono_cartera`, `anular_remision`, `actualizar_pdf_remision`, `resumen_financiero_mensual`, `registrar_movimiento_inventario`), para toda mutación transaccional.
- **La Edge Function `onedrive`**, que gestiona OAuth2 + PKCE empresarial, cifrado de tokens en servidor, subida, descarga y eliminación segura en Microsoft OneDrive.

En el frontend (`frontend/src/`), la **capa de servicios** (`frontend/src/services/`) envuelve todas las llamadas a Supabase para que ninguna pantalla hable con la base de datos directamente.

---

## 2. Reglas de negocio que hay que conocer antes de programar

Estas viven en el backend (triggers y funciones RPC), no en el frontend — el frontend nunca las recalcula, solo las consume:

- **Precio por cliente:** se resuelve en este orden — precio especial (`precios_cliente`) > precio por `tipo_cliente` (`TIENDA`/`DISTRIBUIDOR`) en `productos`. El frontend muestra una estimación informativa en el carrito, pero el importe definitivo lo resuelve `crear_remision`.
- **IVA:** cada producto tiene su propia tasa (19%, 5% o 0%) en `productos.tasa_iva`. Además, cada remisión tiene un toggle `aplica_iva` que, si está apagado, deja todas las líneas en IVA = 0.
- **Inventario (kardex):** el stock nunca se edita directo en la tabla. Baja por trigger cuando se inserta una línea en `detalles_remision` (vía `crear_remision`), sube por trigger cuando una remisión se anula (`anular_remision`), y registra entradas o ajustes de conteo físico vía `registrar_movimiento_inventario` (idempotente y con control de stock esperado).
- **Cartera:** `clientes.saldo_cartera` sube automáticamente al crear una remisión a `CREDITO`, baja al registrar un abono (`registrar_abono`), y se ajusta atómicamente cuando un administrador corrige un abono (`editar_abono_cartera`), impidiendo saldos negativos o sobrepagos sobre remisiones.
- **Protección de registros históricos:**
  - Productos y clientes con movimientos en kardex, remisiones, abonos o documentos asociados no se eliminan físicamente: se desactivan lógicamente (`activo = false`) conservando todo su historial.
  - Documentos vinculados a remisiones (`remision_id`) o de tipo `'FACTURA_DIAN'` están protegidos contra eliminación en el frontend y en la Edge Function `onedrive`.
- **Roles:** `ADMIN` y `VENDEDOR`, definidos en `perfiles.rol`. RLS y `es_admin_activo()` bloquean en el backend lo que cada rol no puede hacer, y el frontend adapta la UI según el rol.

Para el detalle campo por campo: `docs/diccionario_datos.md`.
Para cómo llamar cada cosa desde React: `docs/contrato_api_ariza_erp.md`.

---

## 3. Flujo típico: crear un pedido y guardar su PDF en OneDrive

1. El vendedor arma el carrito en la pantalla de **Catálogo y Pedidos** (`/catalogo`).
2. El frontend llama a `remisionesService.crearRemision(...)`, que internamente hace `supabase.rpc('crear_remision', {...})`.
3. La función RPC, dentro de PostgreSQL: resuelve el precio de cada producto para ese cliente, calcula el IVA por línea, valida que haya stock, inserta la remisión y sus detalles.
4. Los triggers se disparan solos: descuentan el stock, generan el movimiento en `kardex`, y si la remisión es a crédito, suman el total a `saldo_cartera` del cliente.
5. El frontend abre `/remisiones/:id`, desde donde el usuario puede **Descargar PDF**, **Imprimir** o pulsar **Guardar PDF en OneDrive** (que genera el PDF real con el ID y consecutivo de la remisión, lo sube mediante `/functions/v1/onedrive` con `pdf_remision: true` y actualiza `remisiones.pdf_url` sin redirigir falsamente antes de confirmar).

---

## 4. Estructura de carpetas del repositorio

```
erp-ariza/
├── README.md                          # Instalación, estado actual y comandos de verificación
├── .env.example                       # Variables de entorno para scripts de validación
│
├── docs/                              # Documentación técnica versionada en git
│   ├── estructura_proyecto.md         # Arquitectura general y mapa del repositorio
│   ├── diccionario_datos.md           # Tablas, columnas, vistas y funciones RPC
│   ├── contrato_api_ariza_erp.md      # Consumo de PostgREST, RPCs y Edge Functions
│   ├── guia_frontend.md               # Inventario de servicios, firmas y ejemplos
│   └── ONEDRIVE-DESPLIEGUE.md         # Guía de despliegue y contrato de OneDrive empresarial
│
├── database/                          # Esquema SQL, seguridad RLS y migraciones versionadas
│   ├── schema_ariza_erp.sql           # Referencia consolidada de funciones RPC
│   ├── rls_seguridad_e_indices_ariza_erp.sql
│   ├── datos_prueba.sql
│   └── migrations/                    # Migraciones 001 a 007 (inventario, OneDrive, edición de abonos)
│
├── supabase/
│   └── functions/
│       ├── onedrive/index.ts          # Edge Function empresarial Microsoft Graph (OAuth/PKCE, upload, download, delete)
│       ├── onedrive-auth/index.ts     # Endpoint retirado (HTTP 410)
│       └── onedrive-refresh/index.ts  # Endpoint retirado (HTTP 410)
│
├── src/                               # Servicios base y scripts de validación de modelo/controlador
│
└── frontend/                          # Aplicación web principal (React + TypeScript + Vite + Tailwind + shadcn/ui)
    ├── README.md
    ├── PENDIENTES-FRONTEND.md
    ├── playwright.config.ts           # Configuración de pruebas E2E
    ├── tests/                         # 111 pruebas E2E Playwright + 10 pruebas unitarias OneDrive backend
    └── src/
        ├── App.tsx
        ├── index.css
        ├── context/AuthContext.tsx
        ├── components/
        │   ├── layout/AppLayout.tsx   # Navegación desktop/tablet/móvil con alto contraste y soporte de zoom
        │   ├── remisiones/            # AccionesRemision (PDF, Impresión, Guardado directo en OneDrive), AnularRemision
        │   ├── cartera/               # RegistrarAbono, EditarAbono
        │   └── ui/                    # Componentes Radix/shadcn con soporte de viewport y scroll en zoom alto
        ├── pages/
        │   ├── Resumen.tsx
        │   ├── Catalogo.tsx
        │   ├── Remisiones.tsx
        │   ├── DetalleRemision.tsx
        │   ├── Inventario.tsx
        │   ├── Kardex.tsx
        │   ├── PrepararMovimiento.tsx
        │   ├── ProductosAdmin.tsx
        │   ├── AdministrarProducto.tsx
        │   ├── Cartera.tsx
        │   ├── ClienteDetalle.tsx
        │   ├── AdministrarCliente.tsx
        │   ├── Finanzas.tsx
        │   ├── Documentos.tsx
        │   └── OneDriveCallback.tsx
        └── services/                  # Capa de acceso a datos (único punto que invoca supabaseClient)
```

**Regla no negociable de esta estructura:** ninguna pantalla en `pages/` ni componente en `components/` importa `supabaseClient` directamente. Siempre pasan por un archivo de `services/`.

---

## 5. Convenciones de nombres

- **Base de datos → frontend:** los campos nunca cambian de `snake_case` a `camelCase`. Si en la base es `saldo_cartera`, en el objeto de React sigue siendo `saldo_cartera`.
- **Archivos de servicio:** `<entidad>Service.ts`, en plural cuando la entidad lo es (`clientesService.ts`, `gastosService.ts`).
- **Componentes de página:** `PascalCase`, un archivo por pantalla, nombrado igual al módulo de negocio (`DetalleRemision.tsx`, `AdministrarCliente.tsx`).

---

## 6. Seguridad aplicada (Post-Security Advisor)

El esquema de base de datos y la capa de acceso fueron auditados y endurecidos contra Supabase Security Advisor:
- **Aislamiento total del rol `anon`:** `REVOKE ALL` sobre tablas, secuencias y rutinas. Sin sesión iniciada, el acceso es nulo.
- **RPCs y Triggers protegidos:** permisos `EXECUTE` revocados de `PUBLIC` y otorgados únicamente a `authenticated` para funciones RPC de negocio (`es_admin_activo()` valida rol y estado activo en mutaciones administrativas).
- **Inyección de esquema mitigada:** todas las funciones operan con `SET search_path = public, pg_temp`.
- **Vistas seguras:** `vista_alertas_stock` configurada con `security_invoker = true` para respetar las políticas RLS del usuario que consulta.
- **Credenciales Microsoft OneDrive cifradas en servidor:** los tokens OAuth nunca salen al navegador; viven cifrados con AES-GCM (`ONEDRIVE_ENCRYPTION_KEY`) en `onedrive_empresa`.

---

## 7. Variables de entorno necesarias (`frontend/.env.local`)

```
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-del-proyecto>
VITE_ONEDRIVE_REDIRECT_URI=http://localhost:5173/onedrive/callback
```

Nunca se usa la `service_role` key ni secretos de Microsoft en el frontend — esas claves solo viven en Supabase Secrets para las Edge Functions.
