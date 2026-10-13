# FoodMood IA · backend
#
# Imagen mínima para cualquier plataforma con soporte de Docker:
# Railway, Fly.io, Azure Container Apps, DigitalOcean, o una VPS.
#
# Node 26 incluye `node:sqlite`, así que no hace falta instalar SQLite
# ni compilar nada: la imagen solo corre el proyecto.

# Variante slim (Debian) y no alpine a propósito: `node:sqlite` viene
# compilado dentro del binario de Node y la imagen slim es la que mejor
# soportada para base binaria.
FROM node:26-slim

WORKDIR /app

# Solo los manifiestos primero, para que Docker reutilice la capa de
# dependencias cuando no cambian node_modules.
COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Railway y Fly montan un volumen persistente en /data. La base vive ahí
# para que sobreviva a cada despliegue; DATABASE_FILE debe apuntar aquí.
RUN mkdir -p /data
VOLUME ["/data"]

ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_FILE=/data/foodmood.db

EXPOSE 4000

# El healthcheck usa el mismo endpoint que el frontend para saber si la
# API responde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `npm start` ejecuta el archivo TypeScript directamente, sin compilar.
CMD ["npm", "start"]