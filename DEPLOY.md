# Despliegue: Supabase + Render + Vercel

La aplicación tiene tres piezas y cada una vive en un sitio distinto:

```
Vercel          →  frontend React (archivos estáticos)
Render          →  backend Express (API REST + gRPC-Web)
Supabase        →  base de datos Postgres
```

El navegador **nunca** habla con la base de datos: solo llama al backend, y el
backend es el único que conoce la cadena de conexión. Por eso las claves de
Supabase y de la IA viven en Render, jamás en el frontend.

---

## 1. Supabase (la base de datos)

El proyecto ya está creado: `vomcbcbkrpfgmxyzertt`.

### 1.1. Obtener la contraseña

1. Entra a <https://supabase.com/dashboard> y abre el proyecto.
2. **Project Settings → Database → Reset database password**.
3. Genera una contraseña, cópiala y guárdala. **No se vuelve a mostrar.**

Si ya la tienes, sáltate este paso.

### 1.2. Copiar la cadena de conexión correcta

En el panel del proyecto pulsa **Connect** (arriba) y elige
**Session pooler** — no la conexión directa.

¿Por qué la Session Pooler? La conexión directa usa IPv6, y Render no siempre
tiene salida IPv6. La Session Pooler funciona por IPv4 y sirve para una app que
mantiene una sola conexión, como esta.

Te dará algo así:

```
postgresql://postgres.vomcbcbkrpfgmxyzertt:TU-PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

Sustituye `TU-PASSWORD` por la contraseña del paso 1.1. Esa cadena completa es
el valor de `DATABASE_URL`.

### 1.3. No hay que crear tablas

El backend crea el esquema (`users`, `dishes`, `favorites`, etc.) y siembra los
40 platos automáticamente la primera vez que arranca con `DATABASE_URL`.
`CREATE TABLE IF NOT EXISTS` hace que los siguientes arranques no toquen nada.

Si quieres crearlas ya desde tu máquina, salta a “Probar la base desde local”.

---

## 2. Render (el backend)

El servicio ya existe en <https://back-foodia.onrender.com>. Solo hay que
actualizar las variables.

1. Entra a <https://dashboard.render.com> → **foodmood-backend** → **Environment**.
2. Añade o corrige estas variables:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | La cadena **Session Pooler** completa |
| `DATABASE_SSL` | `true` |
| `GRPC_PORT` | `0` |
| `CORS_ORIGIN` | `https://fron-food-ia.vercel.app` |
| `AI_PROVIDER` | `local`, `groq` u `openai` |
| `AI_API_KEY` | La clave del proveedor (solo si no es `local`) |
| `AI_MODEL` | Opcional; por defecto `llama-3.3-70b-versatile` (Groq) o `gpt-4o-mini` (OpenAI) |

3. **Save changes**. Render redespliega solo.

> El plan free de Render “duerme” el servicio tras 15 minutos sin visitas. La
> primera petición después de eso tarda ~30 s en despertar. Es normal.

### Variables que puedes borrar de Render

- `DATABASE_FILE`: ya no se usa cuando hay `DATABASE_URL`.

### gRPC

El proxy HTTP de Render no enruta HTTP/2, así que el gRPC nativo se apaga con
`GRPC_PORT=0`. El **gRPC-Web** sigue disponible por HTTP normal en
`/api/grpc/...`, que es lo que usa el navegador.

---

## 3. Vercel (el frontend)

El proyecto ya existe en <https://fron-food-ia.vercel.app>.

1. Entra a <https://vercel.com> → el proyecto del frontend → **Settings → Environment Variables**.
2. Añade:

| Variable | Valor |
|---|---|
| `VITE_API_BASE_URL` | `https://back-foodia.onrender.com` |

Sin barra final y **sin** `/api`: el código añade las rutas él mismo.

3. Ve a **Deployments → … → Redeploy**. Vercel solo inyecta las variables
   `VITE_*` al construir, así que un cambio de variable no se aplica hasta el
   siguiente despliegue.

Si cambias el dominio del frontend, actualiza también `CORS_ORIGIN` en Render.

---

## 4. La capa de IA

El proyecto tiene tres modos, y solo cambia una variable:

| `AI_PROVIDER` | Qué usa | Clave | Coste |
|---|---|---|---|
| `local` | Generador de texto propio, sin internet | Ninguna | Gratis |
| `groq` | Llama 3.3 70B en Groq | <https://console.groq.com> | Plan gratis |
| `openai` | GPT-4o mini | <https://platform.openai.com> | De pago |

### Groq (recomendado para la demo)

1. Crea una cuenta en <https://console.groq.com>.
2. **API Keys → Create API Key** y copia la clave (`gsk_...`).
3. En Render:

```
AI_PROVIDER=groq
AI_API_KEY=gsk_...
AI_MODEL=llama-3.3-70b-versatile
```

### OpenAI

```
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

### Importante

- La clave **solo** va en Render (backend). Nunca en Vercel ni en el código.
- Si la clave falta o el proveedor falla, la app **no se rompe**: cae sola al
  generador local. El endpoint `/api/health` muestra qué proveedor está activo.
- Groq y OpenAI comparten el mismo formato de API; por eso cambiar de uno a
  otro es solo cambiar la clave y el modelo.

### Chatbot general

El chat de la app usa la misma clave y el mismo proveedor, pero con su propio
tiempo de espera:

```
AI_CHAT_TIMEOUT_MS=12000
```

El bot solo responde sobre comida, dietas y el uso de la app. Las preguntas de
otros temas (sumas, tareas, programación, clima) se rechazan localmente antes de
llamar al modelo, así que el rechazo funciona incluso sin clave y sin gastar
tokens. Si el proveedor falla, responde el texto local y el endpoint sigue
devolviendo 200 con `source: "llm-fallback"` o `"local-model"`.

### Recetas nuevas con IA

`POST /api/recipes/generate` usa el mismo proveedor para crear una receta
completa y guardarla en Supabase. El catálogo deja de estar limitado a las 40
recetas iniciales: cada generación válida suma una más y funciona como cualquier
otra (favoritos, historial, búsqueda y recomendaciones).

```
AI_RECIPE_TIMEOUT_MS=20000
```

La receta se valida antes de guardarse. Si el modelo devuelve datos incompletos,
el endpoint responde 502 y no modifica la base. Sin clave de IA responde 503.

---

## 5. Probar la base desde local (opcional pero recomendado)

Antes de confiar en Render, comprueba que la cadena funciona desde tu máquina:

```powershell
cd Back_FoodIA
$env:DATABASE_URL="postgresql://postgres.vomcbcbkrpfgmxyzertt:TU-PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
$env:DATABASE_SSL="true"
npm run db:check
```

`db:check` solo lee: no crea ni borra nada. Debe responder `Conexión OK` y el
número de tablas (0 si es la primera vez). Después:

```powershell
npm run dev
```

En el arranque debe decir `Base de datos: PostgreSQL (Supabase)` y
`Modelo … | 40 platos`. Si ves eso, las tablas ya están creadas en Supabase.

> Si la contraseña tiene `@`, `:`, `/`, `?`, `#` o `%`, hay que escribirla
> codificada en la URL (`@` → `%40`, `#` → `%23`, `%` → `%25`). Es la causa más
> común de `password authentication failed` con una contraseña correcta.

Para forzar una resiembra:

```powershell
$env:DATABASE_URL="..."
npm run seed -- --force
```

> `npm test` sigue usando SQLite aunque tengas `DATABASE_URL` en el `.env`: el
> runner de pruebas lo ignora a propósito para no tocar la base real.

---

## 6. Verificar que todo quedó bien

```powershell
# 1. Backend vivo y con la IA correcta
curl.exe -s https://back-foodia.onrender.com/api/health

# 2. Catálogo servido desde Supabase
curl.exe -s https://back-foodia.onrender.com/api/dishes?limit=1

# 3. Frontend
curl.exe -s -o NUL -w "%{http_code}" https://fron-food-ia.vercel.app

# 3b. Chatbot vivo y dentro de su alcance
curl.exe -s -X POST https://back-foodia.onrender.com/api/assistant/chat `
  -H "Content-Type: application/json" `
  -d "{\"message\":\"ayúdame con una suma: 2+2\"}"

# 3c. Generar una receta nueva (suma una al catálogo)
curl.exe -s -X POST https://back-foodia.onrender.com/api/recipes/generate `
  -H "Content-Type: application/json" `
  -d "{\"idea\":\"cena rápida con calabaza\"}"

# 4. Datos reales: crea una cuenta en el sitio, guarda un favorito,
#    recarga y comprueba que sigue ahí.
```

Si el punto 4 sobrevive a un redespliegue de Render, Supabase está funcionando.

---

## 7. Errores típicos

| Síntoma | Causa | Solución |
|---|---|---|
| `La conexión a Postgres no respondió` | `DATABASE_URL` mal copiada o Render sin salida a esa región | Revisar que sea la **Session Pooler** y que la contraseña esté bien |
| `password authentication failed` | Contraseña incorrecta o caracteres sin codificar | Resetear la contraseña en Supabase y volver a copiar |
| `self signed certificate` | URL con `sslmode` raro | Dejar que el backend añada TLS (`DATABASE_SSL=true`) |
| El navegador dice “blocked by CORS” | Falta el dominio en `CORS_ORIGIN` | Añadirlo en Render y redesplegar |
| El frontend carga pero no hay platos | `VITE_API_BASE_URL` mal escrita | Debe ser `https://back-foodia.onrender.com`, sin `/api` |
| Los datos desaparecen al redesplegar | Sigue usando SQLite | Confirmar que `DATABASE_URL` está definida en Render |
| `EADDRINUSE` en local | Ya hay otro servidor en el puerto | `Ctrl+C` en la otra terminal |
| La primera petición tarda 30 s | Render free durmió el servicio | Normal; se despierta solo |

---

## 8. Notas de seguridad

- `DATABASE_URL` contiene la contraseña: es un secreto. No la subas al
  repositorio ni la pongas en Vercel.
- El `.gitignore` ya excluye `.env` y `data/`.
- Las tablas viven en el esquema `public` de Supabase. El backend se conecta
  como el usuario `postgres`, así que no hace falta configurar RLS: el
  navegador no tiene acceso directo a Postgres.
- Cualquier persona con la clave de IA puede gastar tu cuota: si se filtra,
  revócala en el panel del proveedor y genera otra.
