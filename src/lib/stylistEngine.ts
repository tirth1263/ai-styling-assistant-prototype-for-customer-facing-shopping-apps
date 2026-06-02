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

const completeOutfitTerms = [
  "outfit",
  "look",
  "cart",
  "ensemble",
  "complete",
  "full",
  "head-to-toe",
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
  const explicitSize = query.match(/\bsize\s*(xs|s|m|l|xl|xxl|\d{1,2})\b/i);
  const alphaSize = query.match(/\b(xs|s|m|l|xl|xxl)\b/i);
  return (explicitSize?.[1] ?? alphaSize?.[1])?.toUpperCase();
};

const inferBudgetScope = (
  query: string,
  tokens: string[],
  categories: Category[],
): "total" | "item" => {
  const lowerQuery = query.toLowerCase();
  if (
    /(per\s+(item|piece|product)|each\s+(item|piece|product)|every\s+(item|piece|product)|per-item)/i.test(
      query,
    )
  ) {
    return "item";
  }

  if (completeOutfitTerms.some((term) => tokens.includes(term) || lowerQuery.includes(term))) {
    return "total";
  }

  return categories.length === 1 ? "item" : "total";
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
  const climate = extractClimate(tokens);
  const categories = categoriesFromTokens(tokens);
  const budgetScope = budget ? inferBudgetScope(query, tokens, categories) : undefined;
  const wantsCompleteOutfit =
    categories.length === 0 ||
    completeOutfitTerms.some((term) => tokens.includes(term) || query.toLowerCase().includes(term));
  const size = extractSize(query);
  const occasion = firstMatch(tokens, occasionTerms, "everyday");
  const vibe = firstMatch(tokens, vibeTerms, "polished");
  const constraints = [
    budget ? `under $${budget}${budgetScope === "item" ? " per item" : " total"}` : "",
    size ? `size ${size}` : "",
    climate ? `${climate} weather` : "",
    categories.length
      ? `needs ${categories.join(", ")}`
      : wantsCompleteOutfit
        ? "complete outfit"
        : "",
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
        budgetScope,
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
    budgetScope,
    wantsCompleteOutfit,
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
  remainingBudget?: number,
) => {
  const item = recommendations.find(
    (recommendation) =>
      recommendation.product.category === category &&
      !used.has(recommendation.product.id) &&
      (remainingBudget === undefined || recommendation.product.price <= remainingBudget),
  );

  if (item) {
    used.add(item.product.id);
    return item.product;
  }

  return undefined;
};

const productMeetsHardConstraints = (product: Product, intent: StyleIntent) => {
  if (intent.size && !product.sizes.includes(intent.size)) {
    return false;
  }

  if (
    intent.budget &&
    intent.budgetScope === "item" &&
    product.price > intent.budget
  ) {
    return false;
  }

  return true;
};

const outfitTotal = (products: Product[]) =>
  products.reduce((sum, product) => sum + product.price, 0);

const categoryScore = (recommendations: Recommendation[], product: Product) =>
  recommendations.find((recommendation) => recommendation.product.id === product.id)?.score ??
  0;

const bestPairUnderBudget = (
  recommendations: Recommendation[],
  firstCategory: Category,
  secondCategory: Category,
  budget: number,
) => {
  const firstItems = recommendations.filter(
    ({ product }) => product.category === firstCategory,
  );
  const secondItems = recommendations.filter(
    ({ product }) => product.category === secondCategory,
  );

  return firstItems
    .flatMap((first) =>
      secondItems.map((second) => ({
        products: [first.product, second.product],
        score: first.score + second.score,
        total: first.product.price + second.product.price,
      })),
    )
    .filter((candidate) => candidate.total <= budget)
    .sort((a, b) => b.score - a.score || a.total - b.total)[0]?.products;
};

const bestSingleUnderBudget = (
  recommendations: Recommendation[],
  category: Category,
  budget: number,
) =>
  recommendations.find(
    ({ product }) => product.category === category && product.price <= budget,
  )?.product;

const buildBudgetedCompleteOutfit = (
  recommendations: Recommendation[],
  intent: StyleIntent,
) => {
  if (!intent.budget) return undefined;

  const dress = bestSingleUnderBudget(recommendations, "dress", intent.budget);
  const separates = bestPairUnderBudget(recommendations, "top", "bottom", intent.budget);
  const dressScore = dress ? categoryScore(recommendations, dress) : -Infinity;
  const separatesScore = separates
    ? separates.reduce((sum, product) => sum + categoryScore(recommendations, product), 0)
    : -Infinity;

  const outfit =
    separates && separatesScore >= dressScore ? [...separates] : dress ? [dress] : [];

  if (!outfit.length) {
    return [];
  }

  const used = new Set(outfit.map((product) => product.id));
  let remainingBudget = intent.budget - outfitTotal(outfit);

  (["shoe", "outerwear", "bag", "accessory"] as Category[]).forEach((category) => {
    const item = pickBest(recommendations, category, used, remainingBudget);
    if (item) {
      outfit.push(item);
      remainingBudget -= item.price;
    }
  });

  return outfit;
};

const buildRequestedCategories = (recommendations: Recommendation[], intent: StyleIntent) => {
  const used = new Set<string>();
  const outfit = intent.categories
    .map((category) => pickBest(recommendations, category, used))
    .filter((product): product is Product => Boolean(product));

  return outfit.length === intent.categories.length ? outfit : [];
};

const buildBudgetedRequestedCategories = (
  recommendations: Recommendation[],
  intent: StyleIntent,
) => {
  if (!intent.budget) return undefined;

  const used = new Set<string>();
  const outfit: Product[] = [];
  let remainingBudget = intent.budget;

  intent.categories.forEach((category) => {
    const item = pickBest(recommendations, category, used, remainingBudget);
    if (item) {
      outfit.push(item);
      remainingBudget -= item.price;
    }
  });

  return outfit.length === intent.categories.length ? outfit : [];
};

const hasCompleteBase = (recommendations: Recommendation[]) => {
  const hasDress = recommendations.some(({ product }) => product.category === "dress");
  const hasTop = recommendations.some(({ product }) => product.category === "top");
  const hasBottom = recommendations.some(({ product }) => product.category === "bottom");
  return hasDress || (hasTop && hasBottom);
};

export const buildOutfit = (
  recommendations: Recommendation[],
  intent: StyleIntent,
): Product[] => {
  const eligibleRecommendations = recommendations.filter(({ product }) =>
    productMeetsHardConstraints(product, intent),
  );

  if (
    intent.wantsCompleteOutfit &&
    intent.budgetScope === "item" &&
    !hasCompleteBase(eligibleRecommendations)
  ) {
    return [];
  }

  if (intent.budget && intent.budgetScope === "total") {
    const budgetedOutfit =
      intent.wantsCompleteOutfit || intent.categories.length === 0
        ? buildBudgetedCompleteOutfit(eligibleRecommendations, intent)
        : buildBudgetedRequestedCategories(eligibleRecommendations, intent);

    return (budgetedOutfit ?? []).slice(0, 5);
  }

  if (intent.categories.length && !intent.wantsCompleteOutfit) {
    return buildRequestedCategories(eligibleRecommendations, intent).slice(0, 5);
  }

  const used = new Set<string>();
  const outfit: Product[] = [];

  const includeDress = intent.categories.includes("dress")
    ? true
    : eligibleRecommendations.some(
        ({ product }) =>
          product.category === "dress" &&
          (product.occasions.includes(intent.occasion) ||
            ["dinner", "wedding", "date"].includes(intent.occasion)),
      );

  if (includeDress) {
    const dress = pickBest(eligibleRecommendations, "dress", used);
    if (dress) {
      outfit.push(dress);
    }
  } else {
    const top = pickBest(eligibleRecommendations, "top", used);
    const bottom = pickBest(eligibleRecommendations, "bottom", used);
    if (top) outfit.push(top);
    if (bottom) outfit.push(bottom);
  }

  (["outerwear", "shoe", "bag", "accessory"] as Category[]).forEach((category) => {
    const item = pickBest(eligibleRecommendations, category, used);
    if (item) outfit.push(item);
  });

  if (outfit.length < 4) {
    eligibleRecommendations.forEach(({ product }) => {
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

const minimumBaseOutfitTotal = (products: Product[], intent: StyleIntent) => {
  const sizeEligible = products.filter((product) =>
    intent.size ? product.sizes.includes(intent.size) : true,
  );
  const occasionEligible =
    intent.occasion === "everyday"
      ? sizeEligible
      : sizeEligible.filter((product) => product.occasions.includes(intent.occasion));
  const candidates = occasionEligible.length ? occasionEligible : sizeEligible;
  const tops = candidates.filter((product) => product.category === "top");
  const bottoms = candidates.filter((product) => product.category === "bottom");
  const dresses = candidates.filter((product) => product.category === "dress");
  const cheapestSeparates = tops
    .flatMap((top) => bottoms.map((bottom) => top.price + bottom.price))
    .sort((a, b) => a - b)[0];
  const cheapestDress = dresses.map((dress) => dress.price).sort((a, b) => a - b)[0];
  const totals = [cheapestSeparates, cheapestDress].filter(
    (total): total is number => total !== undefined,
  );

  return totals.length ? Math.min(...totals) : undefined;
};

const exactFailureRationale = (
  products: Product[],
  intent: StyleIntent,
  recommendations: Recommendation[],
) => {
  const budgetText =
    intent.budget && intent.budgetScope === "total"
      ? `under $${intent.budget} total`
      : intent.budget && intent.budgetScope === "item"
        ? `with every item under $${intent.budget}`
        : "with the requested hard constraints";
  const exactAffordableProducts = recommendations.filter(({ product }) =>
    productMeetsHardConstraints(product, intent) &&
    (!intent.budget || intent.budgetScope !== "total" || product.price <= intent.budget),
  );
  const minimumBase = minimumBaseOutfitTotal(products, intent);
  const baseText =
    intent.wantsCompleteOutfit && minimumBase
      ? ` The lowest base outfit I can assemble from this catalog is ${new Intl.NumberFormat(
          "en-US",
          {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          },
        ).format(minimumBase)} before optional shoes, bags, or accessories.`
      : "";
  const availableText = exactAffordableProducts.length
    ? ` ${exactAffordableProducts.length} individual product${
        exactAffordableProducts.length === 1 ? "" : "s"
      } ${
        exactAffordableProducts.length === 1 ? "meets" : "meet"
      } the hard price/size filter, but ${
        exactAffordableProducts.length === 1 ? "it does" : "they do"
      } not satisfy the complete requested outfit.`
    : " No products in the current catalog satisfy the hard filter well enough to form the requested outfit.";

  return `I could not build an exact ${intent.vibe} ${intent.occasion} result ${budgetText}. The budget and size filters are hard constraints, so I did not include over-budget or unavailable-size items.${baseText}${availableText}`;
};

export const generateStylistResult = (
  products: Product[],
  query: string,
): StylistResult => {
  const intent = parseStyleIntent(query);
  const allRecommendations = retrieveProducts(products, intent);
  const recommendations = allRecommendations.slice(0, 8);
  const outfit = buildOutfit(allRecommendations, intent);
  const palette = unique(outfit.flatMap((item) => item.colors)).slice(0, 5);
  const total = outfit.reduce((sum, item) => sum + item.price, 0);
  const title = outfit.length
    ? `${titleCase(intent.vibe)} ${titleCase(intent.occasion)} Edit`
    : `No Exact ${titleCase(intent.vibe)} ${titleCase(intent.occasion)} Match`;
  const itemNames = outfit.map((item) => item.name);
  const anchorText =
    itemNames.length > 2
      ? `The outfit anchors on ${itemNames.slice(0, 2).join(" and ")}, then adds ${itemNames
          .slice(2)
          .join(", ")} for balance.`
      : `The outfit uses ${itemNames.join(" and ")}.`;
  const budgetText =
    intent.budget && intent.budgetScope === "total"
      ? ` Total is ${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(total)}, within the ${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(intent.budget)} total budget.`
      : "";
  const rationale = outfit.length
    ? [
        `I read this as a ${intent.vibe} ${intent.occasion} request.`,
        anchorText,
        intent.constraints.length
          ? `Hard constraints applied: ${intent.constraints.join(", ")}.${budgetText}`
          : "No hard constraints were detected, so the retrieval weighted occasion, color, category, and semantic similarity.",
      ].join(" ")
    : exactFailureRationale(products, intent, allRecommendations);

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
