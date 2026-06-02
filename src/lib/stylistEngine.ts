import type {
  Category,
  Product,
  Recommendation,
  StyleIntent,
  StylistResult,
} from "../types";

const VECTOR_SIZE = 64;

const categoryTerms: Record<Category, string[]> = {
  top: ["top", "shirt", "blouse", "tee", "sweater", "knit"],
  bottom: ["bottom", "pants", "trouser", "trousers", "jeans", "denim", "skirt"],
  dress: ["dress", "jumpsuit", "one-piece", "gown"],
  outerwear: ["jacket", "blazer", "coat", "outerwear", "layer", "trench"],
  shoe: ["shoe", "shoes", "sneaker", "sneakers", "heel", "heels", "sandal", "sandals"],
  accessory: ["accessory", "scarf", "sunglasses", "jewelry", "belt"],
  bag: ["bag", "tote", "clutch", "crossbody", "purse"],
};

const occasionTerms = [
  "work",
  "conference",
  "dinner",
  "date",
  "wedding",
  "brunch",
  "vacation",
  "travel",
  "weekend",
];

const vibeTerms = [
  "minimal",
  "classic",
  "tailored",
  "casual",
  "comfortable",
  "evening",
  "polished",
  "retro",
  "cozy",
  "statement",
  "street",
  "utility",
  "sleek",
  "soft",
];

const colorTerms = [
  "black",
  "white",
  "ivory",
  "cream",
  "gray",
  "stone",
  "blue",
  "indigo",
  "navy",
  "green",
  "sage",
  "tan",
  "khaki",
  "sand",
  "gold",
  "silver",
  "brown",
  "cognac",
  "coral",
  "tortoise",
];

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "for",
  "from",
  "i",
  "in",
  "into",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "under",
  "with",
]);

export const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9$.\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token));

const hash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

const embed = (tokens: string[]) => {
  const vector = Array.from({ length: VECTOR_SIZE }, () => 0);
  tokens.forEach((token) => {
    const bucket = hash(token) % VECTOR_SIZE;
    const sign = hash(`${token}:sign`) % 2 === 0 ? 1 : -1;
    vector[bucket] += sign;
  });

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
};

const cosine = (a: number[], b: number[]) =>
  a.reduce((sum, value, index) => sum + value * b[index], 0);

const productTokens = (product: Product) =>
  tokenize(
    [
      product.name,
      product.brand,
      product.category,
      product.description,
      product.material,
      ...product.colors,
      ...product.styleTags,
      ...product.occasions,
    ].join(" "),
  );

const firstMatch = (tokens: string[], values: string[], fallback: string) =>
  values.find((value) => tokens.includes(value)) ?? fallback;

const extractBudget = (query: string) => {
  const direct = query.match(/(?:under|below|less than|max|maximum|budget)\s*\$?(\d{2,4})/i);
  const dollar = query.match(/\$(\d{2,4})/);
  const value = direct?.[1] ?? dollar?.[1];
  return value ? Number(value) : undefined;
};

const extractSize = (query: string) => {
  const size = query.match(/\b(?:size\s*)?(xs|s|m|l|xl|xxl|\d{1,2})\b/i);
  return size?.[1]?.toUpperCase();
};

const extractClimate = (tokens: string[]) => {
  if (tokens.some((token) => ["hot", "warm", "summer", "humid"].includes(token))) {
    return "warm";
  }
  if (tokens.some((token) => ["cold", "winter", "rain", "fall", "layer"].includes(token))) {
    return "cool";
  }
  return undefined;
};

const categoriesFromTokens = (tokens: string[]) =>
  Object.entries(categoryTerms)
    .filter(([, terms]) => terms.some((term) => tokens.includes(term)))
    .map(([category]) => category as Category);

const unique = <T,>(items: T[]) => Array.from(new Set(items));

export const parseStyleIntent = (query: string): StyleIntent => {
  const tokens = tokenize(query);
  const palette = colorTerms.filter((color) => tokens.includes(color));
  const budget = extractBudget(query);
  const size = extractSize(query);
  const climate = extractClimate(tokens);
  const categories = categoriesFromTokens(tokens);
  const occasion = firstMatch(tokens, occasionTerms, "everyday");
  const vibe = firstMatch(tokens, vibeTerms, "polished");
  const constraints = [
    budget ? `under $${budget}` : "",
    size ? `size ${size}` : "",
    climate ? `${climate} weather` : "",
    categories.length ? `needs ${categories.join(", ")}` : "",
  ].filter(Boolean);

  const structuredPrompt = JSON.stringify(
    {
      role: "customer-facing retail stylist",
      task: "retrieve coordinated products and explain the outfit",
      input: query,
      inferredIntent: {
        occasion,
        vibe,
        palette: palette.length ? palette : ["flexible"],
        categories: categories.length ? categories : ["complete outfit"],
        constraints,
      },
      retrievalSignals: tokens,
    },
    null,
    2,
  );

  return {
    query,
    tokens,
    occasion,
    vibe,
    palette,
    categories,
    constraints,
    budget,
    climate,
    size,
    structuredPrompt,
  };
};

const reasonFor = (product: Product, intent: StyleIntent, semanticScore: number) => {
  const reasons: string[] = [];

  if (product.occasions.includes(intent.occasion)) {
    reasons.push(`Matches ${intent.occasion}`);
  }

  if (product.styleTags.includes(intent.vibe)) {
    reasons.push(`Fits a ${intent.vibe} vibe`);
  }

  const colorMatch = product.colors.find((color) => intent.palette.includes(color));
  if (colorMatch) {
    reasons.push(`Uses ${colorMatch}`);
  }

  if (intent.budget && product.price <= intent.budget) {
    reasons.push(`Inside $${intent.budget} budget`);
  }

  if (intent.size && product.sizes.includes(intent.size)) {
    reasons.push(`Available in ${intent.size}`);
  }

  if (semanticScore > 0.12) {
    reasons.push("Strong semantic match");
  }

  return reasons.length ? reasons : ["Balances the outfit"];
};

export const retrieveProducts = (
  products: Product[],
  intent: StyleIntent,
): Recommendation[] => {
  const queryEmbedding = embed([
    ...intent.tokens,
    intent.occasion,
    intent.vibe,
    ...intent.palette,
    ...intent.categories,
  ]);

  return products
    .map((product) => {
      const semanticScore = cosine(queryEmbedding, embed(productTokens(product)));
      const occasionBoost = product.occasions.includes(intent.occasion) ? 0.22 : 0;
      const vibeBoost = product.styleTags.includes(intent.vibe) ? 0.16 : 0;
      const categoryBoost =
        intent.categories.length === 0 || intent.categories.includes(product.category)
          ? 0.1
          : 0;
      const colorBoost = product.colors.some((color) => intent.palette.includes(color))
        ? 0.18
        : 0;
      const budgetPenalty = intent.budget && product.price > intent.budget ? -0.22 : 0;
      const sizePenalty = intent.size && !product.sizes.includes(intent.size) ? -0.14 : 0;
      const climateBoost =
        intent.climate === "warm" &&
        product.styleTags.some((tag) => ["summer", "vacation", "soft"].includes(tag))
          ? 0.1
          : intent.climate === "cool" &&
              product.styleTags.some((tag) => ["cozy", "layering", "fall"].includes(tag))
            ? 0.1
            : 0;

      const score =
        semanticScore * 0.6 +
        occasionBoost +
        vibeBoost +
        categoryBoost +
        colorBoost +
        climateBoost +
        budgetPenalty +
        sizePenalty +
        product.rating / 100;

      return {
        product,
        score,
        reasons: reasonFor(product, intent, semanticScore),
      };
    })
    .sort((a, b) => b.score - a.score);
};

const pickBest = (
  recommendations: Recommendation[],
  category: Category,
  used: Set<string>,
) => {
  const item = recommendations.find(
    (recommendation) =>
      recommendation.product.category === category && !used.has(recommendation.product.id),
  );

  if (item) {
    used.add(item.product.id);
    return item.product;
  }

  return undefined;
};

export const buildOutfit = (
  recommendations: Recommendation[],
  intent: StyleIntent,
): Product[] => {
  const used = new Set<string>();
  const outfit: Product[] = [];

  const includeDress = intent.categories.includes("dress")
    ? true
    : recommendations.some(
        ({ product }) =>
          product.category === "dress" &&
          (product.occasions.includes(intent.occasion) ||
            ["dinner", "wedding", "date"].includes(intent.occasion)),
      );

  if (includeDress) {
    const dress = pickBest(recommendations, "dress", used);
    if (dress) {
      outfit.push(dress);
    }
  } else {
    const top = pickBest(recommendations, "top", used);
    const bottom = pickBest(recommendations, "bottom", used);
    if (top) outfit.push(top);
    if (bottom) outfit.push(bottom);
  }

  (["outerwear", "shoe", "bag", "accessory"] as Category[]).forEach((category) => {
    const item = pickBest(recommendations, category, used);
    if (item) outfit.push(item);
  });

  if (outfit.length < 4) {
    recommendations.forEach(({ product }) => {
      if (outfit.length < 5 && !used.has(product.id)) {
        used.add(product.id);
        outfit.push(product);
      }
    });
  }

  return outfit.slice(0, 5);
};

const titleCase = (value: string) =>
  value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const generateStylistResult = (
  products: Product[],
  query: string,
): StylistResult => {
  const intent = parseStyleIntent(query);
  const recommendations = retrieveProducts(products, intent).slice(0, 8);
  const outfit = buildOutfit(recommendations, intent);
  const palette = unique(outfit.flatMap((item) => item.colors)).slice(0, 5);
  const total = outfit.reduce((sum, item) => sum + item.price, 0);
  const title = `${titleCase(intent.vibe)} ${titleCase(intent.occasion)} Edit`;
  const rationale = [
    `I read this as a ${intent.vibe} ${intent.occasion} request.`,
    `The outfit anchors on ${outfit
      .slice(0, 2)
      .map((item) => item.name)
      .join(" and ")}, then adds ${outfit
      .slice(2)
      .map((item) => item.name)
      .join(", ")} for balance.`,
    intent.constraints.length
      ? `Constraints considered: ${intent.constraints.join(", ")}.`
      : "No hard constraints were detected, so the retrieval weighted occasion, color, category, and semantic similarity.",
  ].join(" ");

  return {
    intent,
    recommendations,
    outfit,
    title,
    rationale,
    palette,
    total,
  };
};
