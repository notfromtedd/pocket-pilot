"use client";

import { useState, useEffect } from "react";

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image_emoji: string;
  in_stock: boolean;
  priority_level: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface ProductGridProps {
  cart: CartItem[];
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: string) => void;
}

const CATEGORIES = [
  { key: "all", label: "All", icon: "🏥" },
  { key: "first_aid", label: "First Aid", icon: "🩹" },
  { key: "medication", label: "Medication", icon: "💊" },
  { key: "equipment", label: "Equipment", icon: "🩺" },
  { key: "emergency", label: "Emergency", icon: "🚑" },
];

export default function ProductGrid({ cart, onAddToCart, onRemoveFromCart }: ProductGridProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setProducts(data.products);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter((p) => {
    if (activeCategory !== "all" && p.category !== activeCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getCartQty = (id: string) => cart.find((c) => c.product.id === id)?.quantity || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-[#e65328] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="bg-white/50 border border-white/80 rounded-2xl px-4 py-2.5 focus-within:bg-white/80 transition-colors">
        <input
          type="text"
          className="w-full bg-transparent text-sm focus:outline-none text-slate-800 placeholder-slate-400"
          placeholder="Search medical supplies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`flex-shrink-0 px-3.5 py-2 rounded-full text-[11px] font-bold tracking-wider transition-all cursor-pointer ${
              activeCategory === cat.key
                ? "bg-slate-800 text-white"
                : "bg-white/50 border border-white/60 text-slate-600 hover:bg-white/80"
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((product) => {
          const qty = getCartQty(product.id);
          return (
            <div
              key={product.id}
              className={`bg-white/50 backdrop-blur-sm border rounded-2xl p-4 transition-all duration-200 ${
                !product.in_stock
                  ? "opacity-50 border-slate-200"
                  : qty > 0
                  ? "border-[#e65328]/40 shadow-[0_4px_12px_rgba(230,83,40,0.1)]"
                  : "border-white/80 hover:shadow-sm hover:bg-white/70"
              }`}
            >
              {/* Emoji + Priority */}
              <div className="flex justify-between items-start mb-2">
                <span className="text-3xl">{product.image_emoji}</span>
                {product.priority_level !== "STANDARD" && (
                  <span
                    className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                      product.priority_level === "CRITICAL"
                        ? "bg-red-100 text-red-600"
                        : "bg-orange-100 text-orange-600"
                    }`}
                  >
                    {product.priority_level}
                  </span>
                )}
              </div>

              {/* Name + Description */}
              <h3 className="text-xs font-bold text-[#1a202c] leading-tight">{product.name}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{product.description}</p>

              {/* Price + Actions */}
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm font-bold text-[#1a202c]">
                  KSh {product.price.toLocaleString()}
                </span>

                {!product.in_stock ? (
                  <span className="text-[9px] text-red-500 font-bold">OUT OF STOCK</span>
                ) : qty === 0 ? (
                  <button
                    onClick={() => onAddToCart(product)}
                    className="bg-[#e65328] hover:bg-[#d4431b] text-white text-[10px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-colors"
                  >
                    + Add
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onRemoveFromCart(product.id)}
                      className="w-7 h-7 bg-slate-200 hover:bg-slate-300 rounded-lg flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
                    >
                      −
                    </button>
                    <span className="text-sm font-bold text-[#e65328] w-4 text-center">{qty}</span>
                    <button
                      onClick={() => onAddToCart(product)}
                      className="w-7 h-7 bg-[#e65328] hover:bg-[#d4431b] text-white rounded-lg flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <p className="text-sm font-medium">No products found</p>
        </div>
      )}
    </div>
  );
}
