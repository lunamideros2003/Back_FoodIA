import type { MoodKey } from "../../domain/types.ts";

export interface MoodSeed {
  key: MoodKey;
  label: string;
  emoji: string;
  description: string;
  accent: string;
  sortOrder: number;
}

export const MOODS: MoodSeed[] = [
  {
    key: "tired",
    label: "Cansado",
    emoji: "😴",
    description: "Necesitas algo que se sienta abrazo en un plato.",
    accent: "#8C6E86",
    sortOrder: 1,
  },
  {
    key: "happy",
    label: "Feliz",
    emoji: "😃",
    description: "Todo se te siente más rico hoy: vamos a celebrarlo.",
    accent: "#D98BA0",
    sortOrder: 2,
  },
  {
    key: "stressed",
    label: "Estresado",
    emoji: "😰",
    description: "Buscas calma, sabor familiar y cero complicación.",
    accent: "#B08494",
    sortOrder: 3,
  },
  {
    key: "sad",
    label: "Triste",
    emoji: "🥺",
    description: "Necesitas algo dulce y cálido que te levante el ánimo.",
    accent: "#8A6E8E",
    sortOrder: 4,
  },
  {
    key: "no_energy",
    label: "Sin energía",
    emoji: "🥱",
    description: "Ligero pero que te llene, fácil de digerir.",
    accent: "#C9A66B",
    sortOrder: 5,
  },
  {
    key: "in_a_hurry",
    label: "Necesito algo rápido",
    emoji: "🏃",
    description: "Menos de 20 minutos y a la mesa.",
    accent: "#6E9B8B",
    sortOrder: 6,
  },
];
