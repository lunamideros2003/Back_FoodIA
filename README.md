# FoodMood IA — Backend

API de recomendaciones de comida según el estado de ánimo, con el motor de IA que las produce.

## Arranque

```bash
npm install
npm run dev        # http://localhost:4000
```

La base de datos SQLite se crea y se siembra sola en el primer arranque. Para rehacerla:

```bash
npm run seed -- --force
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática |
| `npm start` | Servidor normal |
| `npm run seed` | Siembra la base (idempotente) |
| `npm test` | 43 pruebas del motor de IA |
| `npm run typecheck` | `tsc --noEmit` |
| `node --experimental-strip-types scripts/smoke.ts` | Prueba de humo de los 26 endpoints |

## Stack

- **Node 22.6+** ejecutando **TypeScript directamente** (sin paso de build: *type stripping* nativo)
- **Express 5** para el HTTP
- **`node:sqlite`** — SQLite viene en Node, no hay dependencias nativas que compilar
- **Zod** para validar la entrada
- **Cero dependencias de IA**: el modelo es propio y funciona sin internet

## Estructura

```
src/
├── ai/                    El modelo
│   ├── vector.ts          Coseno, centroide, utilidades
│   ├── text.ts            Tokenizador español + TF-IDF
│   ├── moodModel.ts       Perfil por ánimo, entrenado en línea y explicable
│   ├── tasteProfile.ts    Perfil de gusto del usuario (basado en contenido)
│   ├── collaborative.ts   ItemKNN sobre el historial implícito
│   ├── intent.ts          Extracción de intención en lenguaje natural
│   ├── health.ts          Condiciones de salud, umbrales y filtros
│   ├── recommender.ts     Pipeline de ranking + MMR + precedencia del ánimo
│   └── narrative.ts       Explicación en español (local o LLM)
├── db/
│   ├── connection.ts      Conexión a SQLite
│   ├── schema.ts          Definición de tablas + migraciones idempotentes
│   ├── seed.ts            Siembra
│   └── seed/              Datos: 6 estados, 40 platos, 40 recetas, historial demo
├── domain/types.ts        Tipos compartidos
├── services/              Repositorios, recomendaciones, balance y usuarios
├── routes/api.routes.ts   Endpoints + validación
└── server.ts              Arranque
```

## El modelo, en detalle

### 1. Representación del plato

Cada plato tiene un vector de **13 rasgos** en `[0, 1]`: `comfort`, `energy`, `speed`,
`lightness`, `richness`, `spice`, `sweetness`, `freshness`, `protein`, `indulgence`, `warmth`,
`complexity`, `value`. Es una representación semántica que permite comparar "qué tan reconfortante
es" con "qué tan rápido se hace" en el mismo espacio, cosa que un nombre o una categoría no
permiten.

### 2. Perfil de estado de ánimo con aprendizaje en línea

Cada ánimo define un **objetivo** (a qué perfil de sabor debería acercarse lo que la gente pide en
ese estado) y una **importancia por rasgo**.

Sin datos, manda el prior curado. A medida que llegan interacciones, se mezclan:

```
confianza = observaciones / (observaciones + 8)
objetivo  = prior·(1 − confianza) + observado·confianza
```

El `+8` es deliberado: con tres clics no se puede reescribir el significado de un ánimo.

Los pesos por rasgo respetan el espacio del prior. Un rasgo que el prior considera irrelevante
para un ánimo (la *rapidez* no es lo que hace que un cansado quiera consuelo) puede entrar, pero
con un techo bajo. Así el modelo aprende sin perder el sentido del dominio.

### 3. Perfil de gusto (contenido)

TF-IDF sobre el texto de cada plato. El vector de un usuario es el **centroide ponderado** de sus
interacciones positivas, restando las negativas. Mezclado con la nota que escribió, ambos
normalizados a longitud 1 para que ninguno de los dos channels anule al otro.

Funciona con acentos y stopwords en español: `tokenize("RÁPIDO y barato")` → `["rapido", "barato"]`.

### 4. Filtrado colaborativo (ItemKNN)

```
like 1.0 · save 1.1 · cook 1.3 · view 0.2 (x0.5) · dislike −1.4
rate → (puntuación/5 − 0.4) × 1.6
```

Cada plato es un vector de usuarios. La similitud es coseno, penalizada por la cantidad de
evidencia (`overlap/(overlap+1.5)`) para que un solo clic compartido no gane. Al predecir, un
plato ya visto por el usuario se excluye siempre.

### 5. Intención en lenguaje natural

TF-IDF entiende "algo con pollo" pero no entiende "**no** quiero nada picante". `intent.ts` lee la
forma de la frase y extrae restricciones duras:

| Lo que escribe el usuario | Restricción |
|---|---|
| `no quiero nada picante` | picor ≤ 0.2 |
| `nada de dulce` | dulzor ≤ 0.35 |
| `muy rápido porfa` | ≤ 20 min |
| `algo barato y ligero` | precio 1, ligereza ≥ 0.6 |
| `vegano por favor` | dieta vegana |
| `sin carne y calientito` | vegetariano, calidez ≥ 0.6 |

Los patrones se compilan sin acentos contra el texto normalizado, así que "rápido" y "rapido"
se comportan igual.

### 6. Filtros de salud

`src/ai/health.ts` es una capa separada porque responde otra pregunta: no *qué se antoja* sino
*qué es seguro*. Es la única capa que puede **excluir** un plato en vez de solo bajarlo de puesto.

| Condición | Excluye | Advierte |
|---|---|---|
| Diabetes | > 22 g azúcar/porción | > 15 g; suma fibra (≥ 6 g) y proteína (≥ 25 g) |
| Hipertensión | > 800 mg sodio | > 400 mg |
| Celiaquía | cualquier gluten | — |
| Intolerancia a la lactosa | leche, queso, mantequilla, crema, yogur | — |
| Colesterol alto | > 30 g grasa | > 22 g |

Los umbrales se calibraron contra la distribución real del catálogo, no a ojo: con los valores
iniciales ningún filtro se disparaba nunca.

Cuando el usuario no ha dicho nada y el grupo de recomendación es peligroso
(≥ 40% con azúcar, sodio o grasa altos), la respuesta trae `needsHealthInfo: true` para que la
interfaz pregunte antes de servir la respuesta.

`GET /api/users/:id/health-report` traduce el perfil a lenguaje humano: qué platos quedaron
fuera y por qué.

### 7. Precedencia del ánimo explícito

Un detalle que solo aparece al probar con datos reales: el gusto aprendido puede anular el ánimo.
Lucía es una usuaria de comida reconfortante; cuando pedía "triste", el modelo le devolvía ramen
y pasta — sus favoritos — en vez de algo dulce.

El arreglo distingue dos cosas que no son lo mismo:

- **Elegir un ánimo es una instrucción.** La persona lo acaba de declarar.
- **El perfil de gusto es un pasado.** Es un supuesto, no un pedido.

```
si mejorAfinidad(ánimo) − afinidadDelPlatoQueMandaElGusto > 0.15  →  pesos a favor del ánimo
```

| Canal | Normal | Con nota escrita | Ánimo explícito gana |
|---|---|---|---|
| Ajuste con el ánimo | 0.30–0.52 | 0.18 | **0.62** |
| Similitud con tu gusto | 0.14–0.20 | 0.57 | 0.08 |
| Colaborativo | 0.12–0.26 | 0.08 | 0.08 |
| Preferencias | 0.12–0.14 | 0.10 | 0.14 |

La regla **no** se aplica cuando el usuario escribió una nota, porque esa nota es la señal más
explícita que existe.

### 8. Balance nutricional

`POST /api/balance` es la segunda mitad de la conversación. Recibe el plato que el usuario va a
comer y cuántas porciones, y devuelve qué conviene para el resto del día.

La severidad no depende solo de las calorías. Un postre de 450 kcal es normal en energía pero
extremo en azúcar, y el consejo que necesita la persona es distinto:

```
carga = max(calorías / meta,  azúcar / 50 g)     (50 g = referencia OMS de azúcares libres)
```

| Carga | Severidad | Tono del mensaje |
|---|---|---|
| ≤ 0.45 | `ok` | "Todavía tienes mucho día por delante" |
| ≤ 0.70 | `watch` | "Vas bien, pero cuídate el resto del día" |
| ≤ 1.00 | `high` | "Buen golpe de azúcar, ahora toca suave" |
| > 1.00 | `over` | "Ya te pasaste por hoy, y está bien" |

Las sugerencias ligeras usan un modo de ranking aparte, con la carga de calorías contra **un
cuarto de la meta diaria** y el azúcar y la grasa pesados explícitamente. Además, si el ánimo es
bajo, se ofrece **una opción de consuelo** aparte: caliente, abrazadora y ligera, porque una
ensalada de verduras frías no es lo que hace falta cuando estás mal.

### 9. Explicación

```
total = Σ canal × peso
```

| Canal | Sin historial | Con historial | Con nota escrita |
|---|---|---|---|
| Ajuste con el ánimo | 0.52 | 0.30 | 0.18 |
| Similitud con tu gusto | 0.14 | 0.20 | 0.57 |
| Colaborativo | 0.12 | 0.26 | 0.08 |
| Preferencias | 0.12 | 0.14 | 0.10 |
| Novedad | 0.04 | 0.05 | 0.02 |
| Popularidad | 0.06 | 0.05 | 0.05 |

Si el usuario escribe una nota, esa nota manda: es una señal más explícita que su estado de ánimo.

### 7. Diversidad (MMR)

```
valor = λ·puntaje − (1−λ)·maxSimilitudConLoYaElegido     (λ = 0.78)
```

Sin esto, un ánimo de confort devuelve cinco variaciones de la misma sopa. Con esto, si una opción
diferente está casi igual de bien puntuada, entra.

### 8. Explicación

Cada eje tiene una frase en español ya escrita (`"se siente como un abrazo"`, `"se arma en nada"`),
así que la oración sale bien gramatizada sea cual sea el número del modelo. No se arma con
plantillas de adjetivos, que es donde estos sistemas suelen romperse.

## Variables de entorno

Copia `.env.example` a `.env`. Todo tiene valores por defecto y funciona sin tocar nada.

```env
PORT=4000
DATABASE_FILE=./data/foodmood.db
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

# local = sin internet y sin costo (default)
# openai = añade un LLM para la explicación, con respaldo automático al local
AI_PROVIDER=local
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL=gpt-4o-mini
```

## Pruebas

```bash
npm test
```

43 pruebas que cubren:

- Coseno y normalización de vectores
- Tokenizador español y TF-IDF
- El modelo de ánimo: ordena bien sin datos, y se mueve con los datos
- ItemKNN: predice, exige evidencia compartida, no se autocompara, y trata un dislike como evidencia negativa
- MMR: prefiere la opción diversa cuando puntúa casi igual
- Intención: negaciones, acentos, y que "quiero" dentro de un "no quiero" no se confunda
- Salud: diabetes, hipertensión, celiaquía, intolerancia a la lactosa y colesterol
- Recetas: los 40 platos tienen pasos, porciones y consejo; la nutrición por porción está en rango
- Precedencia del ánimo: un gusto aprendido no puede anular un "estoy triste"
- Ranking end-to-end contra la base real: filtros de dieta, de tiempo, y el orden según el ánimo
- Narrativa: en español, sin espacios raros antes de los puntos

## Reentrenamiento

Ocurre automáticamente al arrancar y tras cada interacción válida (like, save, cook, rate,
dislike). Con este volumen de datos tarda unos 10 ms, así que no hay cola ni caché que
invalidar. Para forzarlo:

```bash
curl -X POST http://localhost:4000/api/ai/retrain
```

## Sobre las recetas

Las 40 recetas viven en `src/db/seed/recipes.a.ts`, `recipes.b.ts` y `recipes.c.ts`, separadas del
catálogo de platos a propósito: el plato dice *qué es*, la receta dice *cómo se hace*.

Cada receta declara porciones, pasos, consejo del chef y los totales de azúcar, fibra y sodio de la
**receta completa**. Al sembrar, esos tres últimos se dividen entre las porciones para que coincidan
con las calorías y proteínas, que ya se escribían por porción. Una jarra de limonada con 32 g de
azúcar en 4 vasos se guarda como 8 g por vaso.

Un test verifica que ningún plato quede sin receta y que ningún paso termine sin puntuación, que es
la forma más común en que estos archivos se descuidan.
