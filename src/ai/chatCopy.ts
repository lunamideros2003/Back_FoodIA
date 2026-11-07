import type { ChatTopic } from "../domain/chatbot.ts";

/**
 * The fixed copy of the general chatbot.
 *
 * The welcome states the scope before the first question, and the refusal is
 * explicit: the assistant helps with food, diets and the app, not with sums or
 * unrelated tasks.
 */

export const CHAT_WELCOME =
  "¡Hola! Soy Chef, el asistente de FoodMood IA. Puedes preguntarme por recetas, " +
  "ingredientes, dietas o por cómo usar la app. No resuelvo sumas, tareas ni " +
  "preguntas de otros temas.";

export const CHAT_SCOPE_NOTE =
  "Mi tema es la comida, las dietas y FoodMood IA. Si me preguntas algo fuera de ahí, te lo diré con claridad.";

export const OFF_TOPIC_ANSWER =
  "Eso se sale de lo que puedo hacer: solo te ayudo con comida, dietas y el uso de " +
  "FoodMood IA. No resuelvo sumas, tareas ni preguntas de otros temas. " +
  "¿Quieres que hablemos de una receta o de tu alimentación?";

export const GREETING_ANSWER =
  "¡Hola! ¿En qué te ayudo? Puedo darte ideas de comida, hablar de dietas o " +
  "explicarte cómo usar la app.";

export const FOOD_ANSWER =
  "Puedo ayudarte con recetas, ingredientes, sustituciones, dietas y planes de comida. " +
  "Cuéntame un poco más: ¿qué tienes en la nevera, qué dieta sigues o qué se te antoja?";

export const APP_ANSWER =
  "Puedo orientarte con la app: cómo guardar favoritos, usar el historial, armar un " +
  "plan, revisar tu despensa o cambiar tus preferencias. ¿Qué sección quieres usar?";

export const UNKNOWN_ANSWER =
  "No estoy seguro de haberte entendido. Mi tema es la comida, las dietas y esta app. " +
  "¿Me lo cuentas con otras palabras?";

export const CHAT_SUGGESTIONS = [
  "¿Qué puedo cocinar con lo que tengo en la nevera?",
  "¿Qué es una dieta equilibrada?",
  "¿Cómo guardo una receta en favoritos?",
  "¿Cómo armo un plan semanal?",
];

/** The answer used when there is no provider or the provider fails. */
export function localChatCopy(topic: ChatTopic): string {
  switch (topic) {
    case "food":
      return FOOD_ANSWER;
    case "app":
      return APP_ANSWER;
    case "greeting":
      return GREETING_ANSWER;
    case "off-topic":
      return OFF_TOPIC_ANSWER;
    default:
      return UNKNOWN_ANSWER;
  }
}
