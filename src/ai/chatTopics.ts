import type { ChatTopic } from "../domain/chatbot.ts";

/**
 * Topic detection for the general chatbot.
 *
 * The model is useful, but it is also expensive and easy to steer off-topic.
 * This local classifier decides first: an obvious off-topic question (a sum, a
 * programming task, the weather) never reaches the provider, so the refusal is
 * fast, deterministic and works even without an API key.
 */

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const FOOD_TERMS = [
  "receta", "recetas", "cocina", "cocinar", "comer", "comida", "comidas",
  "plato", "platos", "ingrediente", "ingredientes", "alimento", "alimentos",
  "desayuno", "desayunar", "almuerzo", "almorzar", "cena", "cenar",
  "merienda", "tentempie", "snack", "postre", "bebida", "sopa", "ensalada",
  "arroz", "pasta", "pan", "harina", "azucar", "sal", "aceite", "caldo",
  "huevo", "huevos", "leche", "queso", "crema", "mantequilla", "yogur",
  "pollo", "carne", "pescado", "atun", "salmon", "marisco", "legumbre",
  "legumbres", "verdura", "verduras", "fruta", "frutas",
  "proteina", "proteinas", "hidrato", "hidratos", "grasa", "grasas",
  "fibra", "vitamina", "vitaminas", "minerales", "omega", "caloria",
  "calorias", "nutricion", "nutricionista", "dieta", "dietas",
  "alimentacion", "saludable", "vegano", "vegana", "vegetariano",
  "vegetariana", "pescetariano", "mediterranea", "keto", "ayuno",
  "celiaco", "celiaca", "celiaquia", "intolerancia", "intolerante",
  "alergia", "alergias", "gluten", "lactosa", "diabetes", "hipertension",
  "colesterol", "porcion", "porciones", "cucharada", "cucharadita", "taza",
  "gramo", "gramos", "litro", "litros", "mililitro", "mililitros",
  "horno", "hornear", "sarten", "olla", "microondas", "freidora",
  "air fryer", "batidora", "licuadora", "cuchillo", "tabla", "bandeja",
  "fuego", "temperatura", "tiempo de coccion", "coccion", "hervir",
  "freir", "asar", "picar", "cortar", "batir", "mezclar", "sazonar",
  "aderezo", "salsa", "especia", "especias", "picante", "dulce", "salado",
  "amargo", "acido", "umami", "servir", "emplatar", "nevera", "despensa",
  "congelar", "descongelar", "conservar", "sobras", "compra", "mercado",
  "menu", "planificar", "preparar", "agua", "hidratacion",
];

const APP_TERMS = [
  "foodmood", "food mood", "aplicacion", "app", "pagina", "web", "cuenta",
  "usuario", "contrasena", "correo", "iniciar sesion", "registrarme",
  "registro", "perfil", "favoritos", "historial", "despensa", "plan semanal",
  "plan de comidas", "chatbot", "chat", "asistente", "chef ia", "preguntas",
  "ayuda", "guardar", "mis recetas", "mi animo", "recomendaciones",
  "cuestionario",
];

const FOOD_PATTERN = new RegExp(`\\b(${FOOD_TERMS.join("|")})\\b`);
const APP_PATTERN = new RegExp(`\\b(${APP_TERMS.join("|")})\\b`);

const GREETING =
  /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|saludos|que tal)\b/;

/** A number followed by a food unit is a recipe quantity, not a sum. */
const FOOD_UNIT =
  /\b(minutos?|min|gramos?|g|kg|ml|litros?|cucharadas?|cucharaditas?|tazas?|grados|porciones?|personas?)\b/;

const ARITHMETIC = /\b\d+(?:[.,]\d+)?\s*[+\-*/x×÷]\s*\d+(?:[.,]\d+)?\b/;

const OFF_TOPIC_PATTERNS = [
  /\b(suma|sumar|sumame|resta|multiplicacion|multiplicar|ecuacion|integral|derivada|algebra|aritmetica)\b/,
  /\b(codigo|programacion|javascript|typescript|python|java|html|css|sql|compilar|algoritmo)\b/,
  /\b(tarea|deberes|ensayo|examen|poema|cuento|cancion|chiste|traduce|traduccion)\b/,
  /\b(politica|elecciones|presidente|partido politico|futbol|baloncesto|tenis|deporte)\b/,
  /\b(clima|pronostico del tiempo|va a llover|temperatura ambiente)\b/,
  /\b(receta medica|medicamento|pastilla|dosis|diagnostico|diagnostica)\b/,
  /\b(abogado|legal|contrato|impuestos)\b/,
  /\b(quien gano|que paso en|noticias de)\b/,
];

function looksLikeMath(text: string): boolean {
  if (FOOD_UNIT.test(text)) return false;
  return ARITHMETIC.test(text);
}

/** Classifies the message before any model call. */
export function chatTopicOf(message: string): ChatTopic {
  const text = normalize(message);
  if (!text) return "unknown";

  if (looksLikeMath(text) || OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return "off-topic";
  }

  if (text.length <= 24 && GREETING.test(text)) return "greeting";
  if (FOOD_PATTERN.test(text)) return "food";
  if (APP_PATTERN.test(text)) return "app";
  return "unknown";
}
