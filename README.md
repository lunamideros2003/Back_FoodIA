# FoodMood IA — Backend

Este es el backend de FoodMood IA, una app web que recomienda recetas según cómo te sientes, el tiempo que tienes y lo que hay en tu cocina.

El frontend está en otro repositorio: [Fron_FoodIA](https://github.com/lunamideros2003/Fron_FoodIA).

## Qué hace

- Recomienda recetas según el ánimo, el tiempo, el antojo, la dieta y las alergias.
- Tiene un catálogo base de 40 recetas y permite crear recetas nuevas con IA.
- Guarda cuentas, favoritos, historial, notas y preferencias.
- Incluye un chat sobre comida y un asistente para cocinar paso a paso.
- Expone una API REST y también una capa gRPC.

## Tecnologías

- Node.js 22 con TypeScript
- Express
- Zod para validar datos
- SQLite en local y PostgreSQL (Supabase) en producción
- gRPC con `@grpc/grpc-js`
- IA:
  - Motor propio local con TF-IDF, filtrado colaborativo y modelo de ánimo.
  - Proveedor externo compatible con OpenAI (Groq u OpenAI) para el chat, las explicaciones y la generación de recetas.
  - Si no hay proveedor o falla, la app sigue funcionando con el motor local.

## Cómo correrlo

Necesitas Node 22.6 o superior.

```bash
npm install
npm run dev
```

El servidor queda en `http://localhost:4000`. La base SQLite se crea y se llena sola la primera vez.

Para rehacer la base:

```bash
npm run seed -- --force
```

## Variables de entorno

Copia `.env.example` a `.env`. Para desarrollo no hace falta cambiar nada.

Lo más importante:

```env
PORT=4000
DATABASE_FILE=./data/foodmood.db
CORS_ORIGIN=http://localhost:5173

# Opcional: para usar Supabase/PostgreSQL
DATABASE_URL=

# IA. Con "local" funciona sin internet y sin costo.
AI_PROVIDER=local
AI_API_KEY=
AI_MODEL=

# gRPC. Con 0 se apaga.
GRPC_PORT=4002
```

## Pruebas

```bash
npm test
npm run typecheck
```

## Despliegue

- Backend: Render → `https://back-foodia.onrender.com`
- Base de datos: Supabase (PostgreSQL)

La guía completa de despliegue está en [DEPLOY.md](./DEPLOY.md).
