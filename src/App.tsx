import {
  Bookmark,
  BrainCircuit,
  Check,
  ChevronRight,
  Database,
  Filter,
  Gauge,
  Heart,
  ImageUp,
  LayoutGrid,
  Loader2,
  LogOut,
  MessageSquareText,
  PackageSearch,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UploadCloud,
  UserCircle,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, logOut, signInWithGoogle, storage } from "./lib/firebase";
import { generateStylistResult } from "./lib/stylistEngine";
import { sampleProducts } from "./data/sampleProducts";
import type { ChatMessage, Product, SavedOutfit, StylistResult, WardrobeItem } from "./types";

type Tab = "stylist" | "catalog" | "saved";

const promptChips = [
  "Build a polished work outfit under $300",
  "I need a minimal dinner look with black pieces",
  "Plan a comfortable travel outfit for warm weather",
  "Give me a wedding guest outfit with silver accessories",
];

const categories = [
  "all",
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoe",
  "bag",
  "accessory",
] as const;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatPrice = (value: number) => currency.format(value);

const createAssistantMessage = (result: StylistResult): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  createdAt: new Date(),
  content: `${result.title}: ${result.rationale}`,
});

const upsertUserProfile = async (user: User) => {
  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      name: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("stylist");
  const [products, setProducts] = useState<Product[]>(sampleProducts);
  const [usingFallbackCatalog, setUsingFallbackCatalog] = useState(true);
  const [queryText, setQueryText] = useState(promptChips[0]);
  const [activeRequest, setActiveRequest] = useState(promptChips[0]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      createdAt: new Date(),
      content:
        "Tell me the occasion, budget, colors, size, or style you want. I will retrieve products, rank matches, and build a coordinated outfit.",
    },
  ]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<(typeof categories)[number]>("all");
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>([]);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      if (firebaseUser) {
        await upsertUserProfile(firebaseUser);
      } else {
        setSavedOutfits([]);
        setWardrobe([]);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const productsQuery = firestoreQuery(collection(db, "products"), orderBy("name"));
    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        const firestoreProducts = snapshot.docs.map(
          (productDoc) => ({ id: productDoc.id, ...productDoc.data() }) as Product,
        );

        if (firestoreProducts.length) {
          setProducts(firestoreProducts);
          setUsingFallbackCatalog(false);
        } else {
          setProducts(sampleProducts);
          setUsingFallbackCatalog(true);
        }
      },
      () => {
        setProducts(sampleProducts);
        setUsingFallbackCatalog(true);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const outfitsQuery = firestoreQuery(
      collection(db, "users", user.uid, "savedOutfits"),
      orderBy("createdAt", "desc"),
      limit(24),
    );
    const wardrobeQuery = firestoreQuery(
      collection(db, "users", user.uid, "wardrobeItems"),
      orderBy("createdAt", "desc"),
      limit(12),
    );

    const unsubscribeOutfits = onSnapshot(outfitsQuery, (snapshot) => {
      setSavedOutfits(
        snapshot.docs.map(
          (outfitDoc) => ({ id: outfitDoc.id, ...outfitDoc.data() }) as SavedOutfit,
        ),
      );
    });

    const unsubscribeWardrobe = onSnapshot(wardrobeQuery, (snapshot) => {
      setWardrobe(
        snapshot.docs.map(
          (wardrobeDoc) => ({ id: wardrobeDoc.id, ...wardrobeDoc.data() }) as WardrobeItem,
        ),
      );
    });

    return () => {
      unsubscribeOutfits();
      unsubscribeWardrobe();
    };
  }, [user]);

  const activeResult = useMemo(
    () => generateStylistResult(products, activeRequest),
    [activeRequest, products],
  );

  const filteredProducts = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;
      const haystack = [
        product.name,
        product.brand,
        product.category,
        product.description,
        ...product.colors,
        ...product.styleTags,
        ...product.occasions,
      ]
        .join(" ")
        .toLowerCase();

      return matchesCategory && (!normalized || haystack.includes(normalized));
    });
  }, [categoryFilter, products, searchTerm]);

  const catalogStats = useMemo(() => {
    const average =
      products.reduce((sum, product) => sum + product.price, 0) / Math.max(products.length, 1);
    const styles = new Set(products.flatMap((product) => product.styleTags));

    return {
      count: products.length,
      average,
      styles: styles.size,
    };
  }, [products]);

  const handleSignIn = async () => {
    setStatus("");
    try {
      await signInWithGoogle();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Google sign in failed.");
    }
  };

  const seedCatalog = async () => {
    if (!user) {
      setStatus("Sign in with Google before syncing the sample catalog.");
      return;
    }

    setSeeding(true);
    setStatus("");

    try {
      const existing = await getDocs(collection(db, "products"));
      const batch = writeBatch(db);

      sampleProducts.forEach((product) => {
        batch.set(doc(db, "products", product.id), product, { merge: true });
      });

      await batch.commit();
      setStatus(
        existing.empty
          ? "Sample catalog added to Firestore."
          : "Sample catalog refreshed in Firestore.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not sync catalog.");
    } finally {
      setSeeding(false);
    }
  };

  const askStylist = async (event?: FormEvent<HTMLFormElement>, override?: string) => {
    event?.preventDefault();
    const request = (override ?? queryText).trim();
    if (!request) return;

    const result = generateStylistResult(products, request);
    setActiveRequest(request);
    setActiveTab("stylist");
    setQueryText(request);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        createdAt: new Date(),
        content: request,
      },
      createAssistantMessage(result),
    ]);

    if (user) {
      try {
        await addDoc(collection(db, "users", user.uid, "styleSessions"), {
          query: request,
          intent: result.intent,
          recommendedProductIds: result.recommendations.map(
            (recommendation) => recommendation.product.id,
          ),
          outfitProductIds: result.outfit.map((product) => product.id),
          title: result.title,
          rationale: result.rationale,
          total: result.total,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not save style session.");
      }
    }
  };

  const saveOutfit = async () => {
    if (!user) {
      setStatus("Sign in with Google to save outfits.");
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      await addDoc(collection(db, "users", user.uid, "savedOutfits"), {
        title: activeResult.title,
        query: activeResult.intent.query,
        rationale: activeResult.rationale,
        palette: activeResult.palette,
        total: activeResult.total,
        items: activeResult.outfit,
        createdAt: serverTimestamp(),
      });
      setStatus("Outfit saved to Firestore.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save outfit.");
    } finally {
      setSaving(false);
    }
  };

  const uploadWardrobeItem = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!user) {
      setStatus("Sign in with Google before uploading wardrobe images.");
      return;
    }

    setUploading(true);
    setStatus("");

    try {
      const cleanName = file.name.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
      const fileRef = ref(storage, `wardrobe/${user.uid}/${Date.now()}-${cleanName}`);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const imageUrl = await getDownloadURL(fileRef);
      const readableName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim();

      await addDoc(collection(db, "users", user.uid, "wardrobeItems"), {
        name: readableName || "Uploaded wardrobe item",
        imageUrl,
        tags: ["user-upload", "wardrobe"],
        createdAt: serverTimestamp(),
      });
      setStatus("Wardrobe image uploaded to Firebase Storage.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={20} aria-hidden="true" />
          </div>
          <div>
            <p>Retail GenAI Prototype</p>
            <h1>AI Styling Assistant</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={seedCatalog}
            disabled={seeding}
            title="Sync sample products to Firestore"
          >
            {seeding ? <Loader2 className="spin" size={18} /> : <Database size={18} />}
            <span>{usingFallbackCatalog ? "Sync catalog" : "Refresh catalog"}</span>
          </button>

          {authLoading ? (
            <div className="auth-pill">
              <Loader2 className="spin" size={18} />
              <span>Checking auth</span>
            </div>
          ) : user ? (
            <div className="user-menu">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName ?? "Signed in user"} />
              ) : (
                <UserCircle size={30} />
              )}
              <span>{user.displayName ?? "Signed in"}</span>
              <button
                className="icon-button"
                type="button"
                onClick={() => void logOut()}
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button className="primary-button" type="button" onClick={handleSignIn}>
              <ShieldCheck size={18} />
              <span>Sign in with Google</span>
            </button>
          )}
        </div>
      </section>

      {status ? (
        <div className="status-banner" role="status">
          <Check size={16} />
          <span>{status}</span>
        </div>
      ) : null}

      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Structured prompts + embeddings + product retrieval</p>
          <h2>Ask for an occasion. Get a shoppable outfit with ranked retail items.</h2>
          <p>
            This prototype combines Firebase-backed customer state with an on-device
            retrieval engine that parses styling intent, scores catalog products, and
            saves the session history for signed-in shoppers.
          </p>
        </div>
        <div className="hero-media" aria-label="Styled product collage">
          {sampleProducts.slice(0, 5).map((product) => (
            <img key={product.id} src={product.imageUrl} alt={product.name} />
          ))}
        </div>
      </section>

      <section className="metric-grid" aria-label="App metrics">
        <MetricCard
          icon={<PackageSearch size={20} />}
          label="Catalog items"
          value={catalogStats.count.toString()}
          detail={usingFallbackCatalog ? "Local sample set" : "Live Firestore"}
        />
        <MetricCard
          icon={<Gauge size={20} />}
          label="Avg. price"
          value={formatPrice(catalogStats.average)}
          detail="Used for budget fit"
        />
        <MetricCard
          icon={<BrainCircuit size={20} />}
          label="Style signals"
          value={catalogStats.styles.toString()}
          detail="Tags embedded per product"
        />
        <MetricCard
          icon={<Bookmark size={20} />}
          label="Saved outfits"
          value={savedOutfits.length.toString()}
          detail={user ? "Stored in Firestore" : "Sign in to save"}
        />
      </section>

      <nav className="tabs" aria-label="Workspace tabs">
        <button
          type="button"
          className={activeTab === "stylist" ? "active" : ""}
          onClick={() => setActiveTab("stylist")}
        >
          <MessageSquareText size={18} />
          Stylist
        </button>
        <button
          type="button"
          className={activeTab === "catalog" ? "active" : ""}
          onClick={() => setActiveTab("catalog")}
        >
          <LayoutGrid size={18} />
          Catalog
        </button>
        <button
          type="button"
          className={activeTab === "saved" ? "active" : ""}
          onClick={() => setActiveTab("saved")}
        >
          <Heart size={18} />
          Saved
        </button>
      </nav>

      {activeTab === "stylist" ? (
        <section className="workspace">
          <div className="assistant-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Customer query</p>
                <h2>Styling chat</h2>
              </div>
              <span className="live-pill">Retrieval ready</span>
            </div>

            <div className="prompt-row">
              {promptChips.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => void askStylist(undefined, prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="chat-log">
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <span>{message.role === "assistant" ? "AI" : "You"}</span>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>

            <form className="query-form" onSubmit={(event) => void askStylist(event)}>
              <label htmlFor="stylist-query">Ask the styling assistant</label>
              <div>
                <input
                  id="stylist-query"
                  value={queryText}
                  onChange={(event) => setQueryText(event.target.value)}
                  placeholder="Example: I need a navy travel outfit under $350"
                />
                <button type="submit" className="primary-button">
                  <Send size={18} />
                  <span>Ask</span>
                </button>
              </div>
            </form>
          </div>

          <aside className="result-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Recommended outfit</p>
                <h2>{activeResult.title}</h2>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={saveOutfit}
                disabled={saving}
                title="Save outfit"
              >
                {saving ? <Loader2 className="spin" size={18} /> : <Heart size={18} />}
                <span>Save</span>
              </button>
            </div>

            <p className="rationale">{activeResult.rationale}</p>

            <div className="palette-row" aria-label="Recommended color palette">
              {activeResult.palette.map((color) => (
                <span key={color} className="palette-swatch">
                  <i style={{ backgroundColor: colorToCss(color) }} />
                  {color}
                </span>
              ))}
            </div>

            <div className="outfit-list">
              {activeResult.outfit.map((product) => (
                <ProductRow key={product.id} product={product} />
              ))}
            </div>

            <div className="result-total">
              <span>Estimated outfit total</span>
              <strong>{formatPrice(activeResult.total)}</strong>
            </div>

            <details className="prompt-details">
              <summary>
                <BrainCircuit size={17} />
                Structured prompt
              </summary>
              <pre>{activeResult.intent.structuredPrompt}</pre>
            </details>
          </aside>
        </section>
      ) : null}

      {activeTab === "catalog" ? (
        <section className="catalog-layout">
          <div className="catalog-toolbar">
            <div className="search-box">
              <Search size={18} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search color, brand, occasion, or style"
              />
            </div>

            <div className="filter-strip" aria-label="Category filters">
              <Filter size={18} />
              {categories.map((category) => (
                <button
                  type="button"
                  key={category}
                  className={categoryFilter === category ? "active" : ""}
                  onClick={() => setCategoryFilter(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="catalog-grid">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onStyleProduct={(selectedProduct) =>
                  void askStylist(
                    undefined,
                    `Style a coordinated outfit around ${selectedProduct.name} by ${selectedProduct.brand}. Keep it ${selectedProduct.styleTags
                      .slice(0, 2)
                      .join(" and ")} for ${selectedProduct.occasions[0]}.`,
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "saved" ? (
        <section className="saved-layout">
          <div className="wardrobe-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Firebase Storage</p>
                <h2>Wardrobe uploads</h2>
              </div>
              <label className="upload-button">
                {uploading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
                <span>{uploading ? "Uploading" : "Upload"}</span>
                <input type="file" accept="image/*" onChange={uploadWardrobeItem} />
              </label>
            </div>

            {wardrobe.length ? (
              <div className="wardrobe-grid">
                {wardrobe.map((item) => (
                  <article key={item.id} className="wardrobe-card">
                    <img src={item.imageUrl} alt={item.name} />
                    <p>{item.name}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <ImageUp size={28} />
                <p>Upload customer wardrobe or inspiration images after Google sign in.</p>
              </div>
            )}
          </div>

          <div className="saved-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Firestore</p>
                <h2>Saved outfits</h2>
              </div>
            </div>

            {savedOutfits.length ? (
              <div className="saved-grid">
                {savedOutfits.map((outfit) => (
                  <article key={outfit.id} className="saved-card">
                    <div className="saved-images">
                      {outfit.items.slice(0, 4).map((item) => (
                        <img key={item.id} src={item.imageUrl} alt={item.name} />
                      ))}
                    </div>
                    <div>
                      <h3>{outfit.title}</h3>
                      <p>{outfit.rationale}</p>
                      <strong>{formatPrice(outfit.total)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Bookmark size={28} />
                <p>Saved outfit recommendations will appear here.</p>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function ProductRow({ product }: { product: Product }) {
  return (
    <article className="product-row">
      <img src={product.imageUrl} alt={product.name} />
      <div>
        <span>{product.category}</span>
        <h3>{product.name}</h3>
        <p>{product.brand}</p>
      </div>
      <strong>{formatPrice(product.price)}</strong>
    </article>
  );
}

function ProductCard({
  product,
  onStyleProduct,
}: {
  product: Product;
  onStyleProduct: (product: Product) => void;
}) {
  return (
    <article className="product-card">
      <div className="product-image">
        <img src={product.imageUrl} alt={product.name} />
      </div>
      <div className="product-card-body">
        <div className="product-card-title">
          <div>
            <span>{product.brand}</span>
            <h3>{product.name}</h3>
          </div>
          <strong>{formatPrice(product.price)}</strong>
        </div>
        <p>{product.description}</p>
        <div className="tag-row">
          {[product.category, ...product.colors.slice(0, 2), ...product.occasions.slice(0, 2)].map(
            (tag) => (
              <span key={tag}>{tag}</span>
            ),
          )}
        </div>
        <button type="button" onClick={() => onStyleProduct(product)}>
          <ShoppingBag size={17} />
          Add to styling set
          <ChevronRight size={16} />
        </button>
      </div>
    </article>
  );
}

const colorMap: Record<string, string> = {
  black: "#191816",
  white: "#f8f8f2",
  ivory: "#f1ead8",
  cream: "#efe4c8",
  gray: "#85837c",
  stone: "#b8b0a3",
  blue: "#426d9e",
  indigo: "#233c77",
  navy: "#172747",
  green: "#557d63",
  sage: "#9eaf91",
  tan: "#b78b62",
  khaki: "#b19d77",
  sand: "#d3bf99",
  gold: "#c7a84f",
  silver: "#c6c9ca",
  brown: "#7c5036",
  cognac: "#9b5d31",
  coral: "#db6f5b",
  tortoise: "#7e5635",
};

const colorToCss = (color: string) => colorMap[color] ?? color;

export default App;
