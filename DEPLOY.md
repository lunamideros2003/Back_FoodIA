# Despliegue del backend

## El problema que hay que resolver primero

La base de datos es un **archivo**: `data/foodmood.db`. Los servidores sin servidor como Vercel o Netlify
usan un disco que **se borra en cada despliegue**. Cada vez que publicas, la base desaparecería
y las interacciones de los usuarios se perderían.

Por eso el backend **no va en Vercel** aunque el frontend sí. Necesita un servidor con disco
permanente, que se llama *volume*.

```
Vercel        →  frontend  ✅  (archivos estáticos, perfecto)
Railway/Fly   →  backend   ✅  (con volume para la base)
Vercel        →  backend   ❌  (se le olvidaría la base)
```

## Opción recomendada: Railway (la más fácil)

Railway detecta el `Dockerfile` y el `railway.json` que ya vienen en el repositorio. No hace falta
configurar casi nada.

**Pasos**

1. Entra a [railway.app](https://railway.app) con tu cuenta de GitHub
2. **New Project → Deploy from GitHub repo** → elige `Back_FoodIA`
3. Railway detecta el `Dockerfile` y compila solo
4. Cuando termine te da una URL tipo `back-foodia-production.up.railway.app`
5. Ve a **Variables** y agrega estas cuatro:

```
NODE_ENV         = production
DATABASE_FILE    = /data/foodmood.db
CORS_ORIGIN      = https://tu-frontend.vercel.app
PORT             = 4000
```

6. En el servicio, **Volumes → Add Volume**:
   - Mount path: `/data`
   - Nada más

7. **Deploy**. La primera vez tarda unos minutos.

**Verificar** que quedó bien:

```bash
curl https://back-foodia-production.up.railway.app/api/health
# debe responder {"status":"ok",...}
```

Costo: hay un plan gratuito limitado y luego **desde $5 USD/mes** con uso medido. Para un proyecto
de clase suele salir más barato que cualquier alternativa de pago.

## Alternativa gratuita: Oracle Cloud Always Free

Un servidor VPS completo gratis, pero para siempre. Requiere unos pasos más:

```bash
# Ubuntu en una VM con Always Free (1 CPU, 1 GB RAM)
sudo apt update && sudo apt install -y nodejs npm docker.io
sudo mkdir -p /opt/foodmood

# Copiar el proyecto
git clone https://github.com/lunamideros2003/Back_FoodIA.git /opt/foodmood/backend
cd /opt/foodmood/backend

npm ci --omit=dev
DATABASE_FILE=/opt/foodmood/data/foodmood.db CORS_ORIGIN=https://tu-frontend.vercel.app npm start
```

Para que no se apague al cerrar la sesión, usa `pm2`:

```bash
sudo npm install -g pm2
pm2 start npm --name foodmood -- start
pm2 save
pm2 startup    # sigue funcionando aunque reinicies la máquina
```

La ventaja: **no cuesta nada**. La desventaja: registrarte requiere tarjeta, aunque no te cobren.

## Alternativa: Fly.io

Similar a Railway pero con más créditos de prueba gratis y CLI en vez de panel web.

```bash
fly launch --no-deploy                        # crea la app
fly volumes create foodmood_data --size 1      # 1 GB
fly secrets set DATABASE_FILE=/data/foodmood.db CORS_ORIGIN=https://tu-frontend.vercel.app
fly deploy
```

## Si de verdad quieres el backend en Vercel

Se puede, pero hay que **cambiar la base de datos**, porque Vercel no guarda archivos. La opción
más cercana a lo que ya tienes es **Turso (libSQL)**, que es SQLite pero en la nube:

```bash
npm install @libsql/client
```

En `src/db/connection.ts` cambiarías `new DatabaseSync(...)` por un cliente de Turso, y las
variables de entorno serían `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`. El resto del código
(las consultas SQL) no cambia porque sigue siendo SQLite. Es más trabajo y un archivo nuevo, por eso
no es la recomendada.

## Frontend en Vercel

El frontend va normal en Vercel. En la configuración:

- **Root Directory**: `Fron_FoodIA`
- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

En **Variables** agrega:

```
VITE_API_BASE_URL = https://tu-backend.up.railway.app
```

Vite solo expone al navegador las variables que empiezan con `VITE_`, por eso ese prefijo no es
opcional.

## Errores típicos

| Síntoma | Causa | Solución |
|---|---|---|
| `EADDRINUSE` al arrancar local | Ya hay un servidor en el puerto | `Ctrl+C` en la otra terminal |
| El navegador dice "CORS" o "blocked by" | La URL de Vercel no está autorizada | Agregar `CORS_ORIGIN` y redesplegar |
| El frontend carga pero no muestra platos | `VITE_API_BASE_URL` mal escrita | Verificar que termine sin `/api` |
| La base se vacía al redesplegar | No hay volume montado | Crear el volume en `/data` |
| Cambia la URL del frontend en cada deploy | Vercel genera un subdominio nuevo | Fijar un dominio propio, o copiar la URL nueva a `CORS_ORIGIN` |

## Verificar que todo quedó bien

```bash
# 1. El backend responde
curl https://tu-backend.up.railway.app/api/health

# 2. El frontend lo alcanza
curl https://tu-backend.up.railway.app/api/moods

# 3. Desde el navegador, abrir el sitio y revisar la consola:
#    no debe haber errores de red
```

Si el backend responde pero el navegador muestra "blocked by CORS", el problema está en
`CORS_ORIGIN` y nada más.