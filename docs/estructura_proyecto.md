# Estructura y Comportamiento del Proyecto — ArizaERP

**Léelo primero.** Este documento explica cómo está armado el sistema y por qué, para que cualquier persona (o agente de IA) que trabaje en este repo entienda las reglas antes de tocar código. Los detalles exactos de cada tabla y cada endpoint están en los otros dos documentos de `docs/` — este archivo es el mapa que conecta todo.

---

## 1. La arquitectura en una frase

**React habla directo con Supabase. No hay servidor propio.** Ni Node, ni Express, ni un backend intermedio. El frontend llama a la API REST que PostgREST autogenera a partir del esquema de PostgreSQL, y a un puñado de funciones RPC para la lógica de negocio que no es un simple CRUD.

```
┌─────────────┐        supabase-js         ┌──────────────────────────┐
│   React     │ ───────────────────────────▶│  Supabase                │
│  (frontend) │                              │  - PostgREST (API REST) │
│             │◀─────────────────────────────│  - PostgreSQL + RLS     │
└─────────────┘                              │  - Triggers             │
                                              │  - Funciones RPC        │
                                              │  - Auth                 │
                                              │  - Storage               │
                                              └──────────────────────────┘
```

No existe una capa "Controlador" en el sentido tradicional de un backend. Lo que cumple ese rol son dos cosas:
- **PostgREST**, para operaciones simples (leer productos, leer clientes).
- **Las funciones RPC** (`crear_remision`, `registrar_abono`, `resumen_financiero_mensual`), para todo lo que implica una regla de negocio real.

En el frontend, lo más cercano a un "controlador" es la **capa de servicios** (`src/services/`): funciones que envuelven las llamadas a Supabase para que ninguna pantalla hable con la base de datos directamente.

---

## 2. Reglas de negocio que hay que conocer antes de programar

Estas viven en el backend (triggers y funciones RPC), no en el frontend — el frontend nunca las recalcula, solo las consume:

- **Precio por cliente:** se resuelve en este orden — precio especial (`precios_cliente`) > precio por `tipo_cliente` (`TIENDA`/`DISTRIBUIDOR`) en `productos`. El frontend nunca decide el precio, lo recibe ya resuelto de `crear_remision`.
- **IVA:** cada producto tiene su propia tasa (19%, 5% o 0%) en `productos.tasa_iva`. Además, cada remisión tiene un toggle `aplica_iva` que, si está apagado, deja todas las líneas en IVA = 0. Es responsabilidad del frontend mostrar ese switch, no calcular el IVA.
- **Inventario (kardex):** el stock nunca se edita directo. Baja solo, por trigger, cuando se inserta una línea en `detalles_remision` (vía `crear_remision`). Sube solo, por trigger, cuando una remisión a crédito se anula.
- **Cartera:** `clientes.saldo_cartera` sube automáticamente al crear una remisión a `CREDITO`, y baja automáticamente al registrar un abono (`registrar_abono`). Nunca se edita a mano.
- **Roles:** `ADMIN` y `VENDEDOR`, definidos en `perfiles.rol`. RLS ya bloquea en el backend lo que cada rol no debería poder hacer (ej. un `VENDEDOR` no puede leer `gastos`), pero el frontend también debe ocultar esas opciones de la UI según el rol — no solo confiar en que el backend las bloquee.

Para el detalle campo por campo: `docs/diccionario_datos.md`.
Para cómo llamar cada cosa desde React: `docs/contrato_api_ariza_erp.md`.

---

## 3. Flujo típico: crear un pedido (ejemplo de cómo se conecta todo)

1. El vendedor arma el carrito en la pantalla de **Creador de Pedido**.
2. El frontend llama a `remisionesService.crearRemision(...)`, que internamente hace `supabase.rpc('crear_remision', {...})`.
3. La función RPC, dentro de PostgreSQL: resuelve el precio de cada producto para ese cliente, calcula el IVA por línea, valida que haya stock, inserta la remisión y sus detalles.
4. Los triggers se disparan solos: descuentan el stock, generan el movimiento en `kardex`, y si la remisión es a crédito, suman el total a `saldo_cartera` del cliente.
5. El frontend recibe de vuelta el `id` de la remisión creada — con eso genera el PDF y lo sube a OneDrive (esto último todavía no implementado, ver sección 6).

Ninguno de los cálculos de precio/IVA/stock pasa por React en ningún punto de este flujo.

---

## 4. Estructura de carpetas del repositorio

```
ariza-erp/
├── README.md                          # qué es el proyecto, cómo levantarlo localmente
├── .env.example                        # variables de entorno necesarias (sin valores reales)
│
├── docs/                               # toda la documentación del proyecto, versionada en git
│   ├── estructura_proyecto.md          # este documento
│   ├── diccionario_datos.md            # referencia de cada tabla/columna
│   └── contrato_api_ariza_erp.md       # cómo consumir la API desde el frontend
│
├── database/                           # todo lo que corre en Supabase, fuera del código de React
│   ├── schema_ariza_erp.sql            # tablas, triggers, funciones RPC
│   ├── rls_seguridad_e_indices_ariza_erp.sql
│   ├── datos_prueba.sql                # dataset sintético para desarrollo/pruebas
│   └── migrations/                     # cambios futuros al esquema, versionados y numerados
│
├── public/
│
└── src/
    ├── main.tsx
    ├── App.tsx
    │
    ├── types/
    │   └── database.types.ts           # interfaces TS espejo del diccionario_datos.md
    │
    ├── services/                       # la capa "controlador" — ÚNICO lugar que llama a Supabase
    │   ├── supabaseClient.ts           # inicialización del cliente (URL + anon key desde .env)
    │   ├── productosService.ts
    │   ├── clientesService.ts
    │   ├── remisionesService.ts
    │   ├── carteraService.ts
    │   ├── gastosService.ts
    │   └── errorHandler.ts             # traduce errores de Supabase/RPC a mensajes de usuario
    │
    ├── context/
    │   └── AuthContext.tsx             # sesión activa + rol del usuario logueado
    │
    ├── hooks/
    │   ├── useAuth.ts
    │   ├── useCatalogo.ts
    │   └── useCartera.ts
    │
    ├── components/                     # piezas de UI reutilizables
    │   ├── ui/                         # botones, inputs, tablas genéricas
    │   └── layout/                     # navbar, sidebar (varía según rol)
    │
    ├── pages/                          # una por pantalla/módulo del sistema
    │   ├── Login.tsx
    │   ├── Catalogo.tsx
    │   ├── CrearPedido.tsx
    │   ├── Cartera.tsx
    │   ├── Gastos.tsx                  # solo accesible si rol === 'ADMIN'
    │   └── Dashboard.tsx
    │
    └── styles/
```

**Regla no negociable de esta estructura:** ninguna pantalla en `pages/` ni componente en `components/` importa `supabaseClient` directamente. Siempre pasan por un archivo de `services/`. Esto es lo que mantiene la separación Modelo/Controlador/Vista real en un proyecto sin backend propio — si se rompe esta regla, el patrón MVC deja de existir en la práctica.

---

## 5. Convenciones de nombres

- **Base de datos → frontend:** los campos nunca cambian de `snake_case` a `camelCase`. Si en la base es `saldo_cartera`, en el objeto de React sigue siendo `saldo_cartera` — no se traduce en ningún punto (ver `contrato_api_ariza_erp.md`, sección de convenciones).
- **Archivos de servicio:** `<entidad>Service.ts`, en plural cuando la entidad lo es (`clientesService.ts`, no `clienteService.ts`).
- **Componentes de página:** `PascalCase`, un archivo por pantalla, nombrado igual al módulo de negocio (`CrearPedido.tsx`, no `OrderForm.tsx`).

---

## 6. Lo que todavía no está resuelto (para no asumir que falta por error)

- **Generación y subida de PDF de remisión a OneDrive:** requiere una función serverless (Edge Function) para el intercambio de tokens OAuth2 con Microsoft Graph API. No se ha implementado — se aborda cuando el equipo llegue a esa parte.
- **MFA para el rol ADMIN:** decidido pero pendiente de configurar en Supabase Auth.
- **Conexión del repo a Supabase vía GitHub Integration:** pendiente a propósito hasta que el esquema esté más estable.

---

## 7. Variables de entorno necesarias

```
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-del-proyecto>
```

Nunca se usa la `service_role` key en el frontend — esa key tiene bypass de RLS y solo debe vivir en entornos de servidor/Edge Functions, nunca en código que llega al navegador.
