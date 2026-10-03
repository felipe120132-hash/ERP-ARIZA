# ArizaERP

Sistema de Gestión Empresarial (ERP) para Distribuidora y Comercializadora Ariza.

Arquitectura basada en **React + Vite + TypeScript**, comunicándose directamente con **Supabase** (PostgREST, Auth, Triggers y funciones RPC en PostgreSQL) sin backend intermediario.

---

## 🚀 Requisitos Previos

- [Node.js](https://nodejs.org/) (versión 18, 20 o superior recomendada)
- [npm](https://www.npmjs.com/) (incluido con Node.js)

---

## 🛠️ Instalación y Puesta en Marcha Local

### 1. Clonar el repositorio
```bash
git clone <URL_DEL_REPOSITORIO>
cd ERP-ARIZA
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Copia el archivo `.env.example` y crea tu archivo local `.env`:

```bash
cp .env.example .env
```
*(En Windows PowerShell: `Copy-Item .env.example .env`)*

Abre `.env` y completa tus credenciales de Supabase:
```env
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu-anon-key>
```

> **Nota de seguridad:** Utiliza únicamente la clave pública/anónima (`anon key`). Nunca utilices la clave `service_role` en el frontend.

### 4. Ejecutar el servidor de desarrollo
Inicia Vite en modo desarrollo con Hot Module Replacement (HMR):

```bash
npm run dev
```

La aplicación estará disponible típicamente en `http://localhost:5173/`.

---

## 📦 Scripts Disponibles

- `npm run dev`: Inicia el servidor de desarrollo local con Vite.
- `npm run build`: Compila y valida el proyecto con TypeScript (`tsc -b`) y genera el bundle de producción en `dist/`.
- `npm run preview`: Previsualiza localmente el build de producción generado.
- `npm run lint`: Ejecuta el linter (Oxlint).
- `npm run validar:modelo`: Valida los datos existentes en Supabase contra los schemas de Zod.

---

## 📂 Estructura del Proyecto

La estructura del código fuente sigue la arquitectura definida en `docs/estructura_proyecto.md`:

```
ariza-erp/
├── README.md                          # Este archivo: instrucciones y guía rápida
├── .env.example                       # Plantilla de variables de entorno requeridas
├── docs/                              # Documentación oficial del proyecto
│   ├── estructura_proyecto.md         # Arquitectura y reglas de negocio
│   ├── diccionario_datos.md           # Esquema de base de datos
│   └── contrato_api_ariza_erp.md      # Contrato de integración frontend-Supabase
├── database/                          # Scripts SQL y migraciones de Supabase
├── public/                            # Recursos estáticos
└── src/
    ├── main.tsx                       # Punto de entrada de la aplicación
    ├── App.tsx                        # Configuración de rutas y proveedores principales
    ├── types/                         # Interfaces TypeScript (database.types.ts)
    ├── services/                      # Única capa autorizada para comunicarse con Supabase
    ├── context/                       # Contextos globales (ej. AuthContext)
    ├── hooks/                         # Custom hooks reutilizables (useAuth, useCatalogo, etc.)
    ├── components/
    │   ├── ui/                        # Componentes UI reutilizables (Button, Input, etc.)
    │   └── layout/                    # Componentes de estructura (Navbar, Sidebar)
    ├── pages/                         # Vistas por pantalla/módulo del sistema
    └── styles/                        # Hojas de estilo globales y modulares
```

> **Regla de Arquitectura:** Ningún componente ni página debe importar `supabaseClient` directamente. Todas las interacciones con la base de datos se gestionan a través de los módulos en `src/services/`.
