import type { InteractionAction, MoodKey } from "../../domain/types.ts";

interface DemoItem {
  slug: string;
  moodKey: MoodKey;
  action: InteractionAction;
  rating?: number;
  hoursAgo: number;
}

interface DemoBlock {
  email: string;
  items: DemoItem[];
}

/**
 * Simulated interaction history so the collaborative-filtering layer has
 * something to learn from on a fresh install. New interactions recorded by the
 * app are appended to the same tables and feed the same model.
 */
export const DEMO_INTERACTIONS: DemoBlock[] = [
  {
    email: "lucia@foodmood.app",
    items: [
      { slug: "instant-miso-ramen", moodKey: "tired", action: "cook", rating: 5, hoursAgo: 200 },
      { slug: "creamy-tomato-pasta", moodKey: "stressed", action: "like", rating: 4, hoursAgo: 190 },
      { slug: "homemade-pizza-margherita", moodKey: "happy", action: "cook", rating: 5, hoursAgo: 180 },
      { slug: "greek-yogurt-power-bowl", moodKey: "in_a_hurry", action: "like", rating: 4, hoursAgo: 170 },
      { slug: "homemade-pizza-margherita", moodKey: "stressed", action: "like", rating: 5, hoursAgo: 160 },
      { slug: "rainbow-quinoa-salad", moodKey: "no_energy", action: "like", rating: 4, hoursAgo: 150 },
      { slug: "mushroom-risotto", moodKey: "tired", action: "rate", rating: 3, hoursAgo: 140 },
      { slug: "chicken-burrito-bowl", moodKey: "in_a_hurry", action: "cook", rating: 4, hoursAgo: 130 },
      { slug: "brownie-salted-caramel", moodKey: "happy", action: "like", rating: 5, hoursAgo: 120 },
      { slug: "lentil-bolognese", moodKey: "stressed", action: "cook", rating: 5, hoursAgo: 110 },
      { slug: "churros-chocolate-sauce", moodKey: "happy", action: "like", rating: 4, hoursAgo: 100 },
      { slug: "avocado-toast-poached-egg", moodKey: "in_a_hurry", action: "dislike", rating: 2, hoursAgo: 90 },
      { slug: "japanese-curry-rice", moodKey: "tired", action: "like", rating: 4, hoursAgo: 80 },
      { slug: "salmon-poke-bowl", moodKey: "no_energy", action: "like", rating: 4, hoursAgo: 70 },
      { slug: "tomato-basil-soup", moodKey: "stressed", action: "rate", rating: 3, hoursAgo: 60 },
      { slug: "molten-chocolate-lava-cake", moodKey: "happy", action: "save", rating: 5, hoursAgo: 50 },
      { slug: "ginger-garlic-rice", moodKey: "in_a_hurry", action: "like", rating: 4, hoursAgo: 40 },
      { slug: "instant-miso-ramen", moodKey: "stressed", action: "cook", rating: 5, hoursAgo: 30 }
    ],
  },
  {
    email: "demo@foodmood.app",
    items: [
      { slug: "rainbow-quinoa-salad", moodKey: "no_energy", action: "cook", rating: 5, hoursAgo: 300 },
      { slug: "lentil-bolognese", moodKey: "stressed", action: "cook", rating: 5, hoursAgo: 290 },
      { slug: "chia-pudding-berries", moodKey: "no_energy", action: "like", rating: 4, hoursAgo: 280 },
      { slug: "chickpea-smash-sandwich", moodKey: "in_a_hurry", action: "cook", rating: 4, hoursAgo: 270 },
      { slug: "strawberry-overnight-oats", moodKey: "tired", action: "like", rating: 4, hoursAgo: 260 },
      { slug: "caprese-bruschetta", moodKey: "happy", action: "like", rating: 4, hoursAgo: 250 },
      { slug: "tomato-basil-soup", moodKey: "stressed", action: "rate", rating: 4, hoursAgo: 240 },
      { slug: "green-detox-smoothie", moodKey: "no_energy", action: "cook", rating: 4, hoursAgo: 230 },
      { slug: "mushroom-risotto", moodKey: "tired", action: "like", rating: 4, hoursAgo: 220 },
      { slug: "homemade-lemonade", moodKey: "happy", action: "like", rating: 3, hoursAgo: 210 },
      { slug: "shakshuka", moodKey: "in_a_hurry", action: "cook", rating: 5, hoursAgo: 200 },
      { slug: "instant-miso-ramen", moodKey: "tired", action: "rate", rating: 2, hoursAgo: 190 }
    ],
  },
];
