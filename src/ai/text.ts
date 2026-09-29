/**
 * Minimal TF-IDF text pipeline used to compare what the user asks for with
 * what each dish is described as. Works for Spanish: accents are stripped and
 * a compact stopword list keeps filler words out of the vector.
 */

const STOPWORDS = new Set([
  "de", "del", "la", "las", "el", "los", "un", "una", "unos", "unas", "y", "o",
  "u", "con", "sin", "que", "para", "por", "en", "a", "al", "es", "soy",
  "estoy", "tengo", "mucho", "mucha", "muy", "mas", "pero", "me", "mi", "mis",
  "tu", "tus", "se", "lo", "alguno", "nada", "como", "quiero", "necesito",
  "gusto", "gusta", "hambre", "cansado", "cansada", "feliz", "estresado",
  "estresada", "energia", "animo", "estado", "plato", "comer", "comida",
  "algo", "deseo", "tengo", "esta", "este", "hoy", "ahora", "ya", "siento",
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u00f1\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export interface TfidfModel {
  idf: Map<string, number>;
  vectors: Map<number, number[]>;
  vocabulary: string[];
}

export function buildTfidfModel(
  documents: { id: number; text: string }[],
): TfidfModel {
  const termFrequency = new Map<number, Map<string, number>>();
  const documentFrequency = new Map<string, number>();

  for (const doc of documents) {
    const counts = new Map<string, number>();
    for (const token of tokenize(doc.text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    for (const token of counts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
    termFrequency.set(doc.id, counts);
  }

  const totalDocuments = documents.length;
  const idf = new Map<string, number>();
  for (const [token, freq] of documentFrequency) {
    idf.set(token, Math.log((totalDocuments + 1) / (freq + 1)) + 1);
  }

  const vocabulary = [...new Set([...termFrequency.values()].flatMap((c) => [...c.keys()]))].sort();
  const vocabularyIndex = new Map(vocabulary.map((term, index) => [term, index]));

  const vectors = new Map<number, number[]>();
  for (const [id, counts] of termFrequency) {
    const vector = new Array<number>(vocabulary.length).fill(0);
    for (const [term, freq] of counts) {
      const index = vocabularyIndex.get(term);
      if (index === undefined) continue;
      const sublinear = 1 + Math.log(freq);
      vector[index] = sublinear * (idf.get(term) ?? 1);
    }
    vectors.set(id, vector);
  }

  return { idf, vectors, vocabulary };
}

export function vectorizeQuery(model: TfidfModel, query: string): number[] {
  const vector = new Array<number>(model.vocabulary.length).fill(0);
  for (const token of tokenize(query)) {
    const index = model.vocabulary.indexOf(token);
    if (index === -1) continue;
    vector[index] = (1 + Math.log(1)) * (model.idf.get(token) ?? 1);
  }
  return vector;
}

export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dimension = vectors[0].length;
  const result = new Array<number>(dimension).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dimension; i += 1) result[i] += vector[i];
  }
  return result.map((value) => value / vectors.length);
}
