import type { Timestamp } from "firebase/firestore";

export type Category =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "shoe"
  | "accessory"
  | "bag";

export type Product = {
  id: string;
  name: string;
  brand: string;
  category: Category;
  price: number;
  colors: string[];
  styleTags: string[];
  occasions: string[];
  sizes: string[];
  imageUrl: string;
  rating: number;
  description: string;
  material: string;
  inventory: number;
};

export type StyleIntent = {
  query: string;
  tokens: string[];
  occasion: string;
  vibe: string;
  palette: string[];
  categories: Category[];
  constraints: string[];
  budget?: number;
  climate?: string;
  size?: string;
  structuredPrompt: string;
};

export type Recommendation = {
  product: Product;
  score: number;
  reasons: string[];
};

export type StylistResult = {
  intent: StyleIntent;
  recommendations: Recommendation[];
  outfit: Product[];
  title: string;
  rationale: string;
  palette: string[];
  total: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

export type SavedOutfit = {
  id: string;
  title: string;
  query: string;
  rationale: string;
  palette: string[];
  total: number;
  items: Product[];
  createdAt?: Timestamp;
};

export type WardrobeItem = {
  id: string;
  name: string;
  imageUrl: string;
  tags: string[];
  createdAt?: Timestamp;
};
