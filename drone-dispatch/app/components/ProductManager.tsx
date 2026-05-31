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

const EMOJIS = ["💊", "💉", "🩹", "🩺", "🧴", "💨", "❤️", "🌡️", "🧤", "💧", "🩸", "🚑", "🫁", "🏥", "⚕️"];
const CATEGORIES = ["first_aid", "medication", "equipment", "emergency"];
const PRIORITIES = ["STANDARD", "HIGH", "CRITICAL"];

export default function ProductManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("first_aid");
  const [price, setPrice] = useState("");
  const [emoji, setEmoji] = useState("💊");
  const [priority, setPriority] = useState("STANDARD");

  const fetchProducts = async () => {
    const res = await fetch("/api/products");
    const data = await res.json();
    if (data.success) setProducts(data.products);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const resetForm = () => {
    setName(""); setDescription(""); setCategory("first_aid");
    setPrice(""); setEmoji("💊"); setPriority("STANDARD");
    setEditingId(null); setShowForm(false);
  };

  const handleEdit = (p: Product) => {
    setName(p.name); setDescription(p.description); setCategory(p.category);
    setPrice(p.price.toString()); setEmoji(p.image_emoji); setPriority(p.priority_level);
    setEditingId(p.id); setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = { name, description, category, price: parseFloat(price) || 0, image_emoji: emoji, priority_level: priority };

    if (editingId) {
      await fetch("/api/products", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, ...body }) });
    } else {
      await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }

    await fetchProducts();
    resetForm();
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/products?id=${id}`, { method: "DELETE" });
    await fetchProducts();
  };

  const handleToggleStock = async (p: Product) => {
    await fetch("/api/products", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, in_stock: !p.in_stock }) });
    await fetchProducts();
  };

  if (loading) {
    return <div className="flex justify-center py-10"><div className="w-8 h-8 border-3 border-[#e65328] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#1a202c]">Product Catalog</h3>
          <p className="text-[10px] text-slate-500">{products.length} items</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-[#e65328] hover:bg-[#d4431b] text-white text-[10px] font-bold px-4 py-2 rounded-xl cursor-pointer transition-colors"
        >
          + Add Product
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white/60 border border-white/80 rounded-2xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-700">{editingId ? "Edit Product" : "New Product"}</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Name</label>
              <input className="w-full bg-white/50 border border-white/80 rounded-xl px-3 py-2 text-xs focus:outline-none" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Price (KSh)</label>
              <input type="number" className="w-full bg-white/50 border border-white/80 rounded-xl px-3 py-2 text-xs focus:outline-none" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Description</label>
            <input className="w-full bg-white/50 border border-white/80 rounded-xl px-3 py-2 text-xs focus:outline-none" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Category</label>
              <select className="w-full bg-white/50 border border-white/80 rounded-xl px-3 py-2 text-xs focus:outline-none" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Priority</label>
              <select className="w-full bg-white/50 border border-white/80 rounded-xl px-3 py-2 text-xs focus:outline-none" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Icon</label>
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => setEmoji(e)} className={`text-lg cursor-pointer rounded p-0.5 ${emoji === e ? "bg-[#e65328]/20 ring-1 ring-[#e65328]" : "hover:bg-slate-100"}`}>{e}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !name} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-bold px-4 py-2 rounded-xl cursor-pointer transition-colors">
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
            <button onClick={resetForm} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold px-4 py-2 rounded-xl cursor-pointer transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Product List */}
      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 bg-white/50 border border-white/80 rounded-xl p-3 ${!p.in_stock ? "opacity-50" : ""}`}>
            <span className="text-xl">{p.image_emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#1a202c] truncate">{p.name}</p>
              <p className="text-[10px] text-slate-500">{p.category.replace("_", " ")} · KSh {p.price.toLocaleString()}</p>
            </div>
            <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
              p.priority_level === "CRITICAL" ? "bg-red-100 text-red-600" : p.priority_level === "HIGH" ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"
            }`}>{p.priority_level}</span>
            <div className="flex gap-1">
              <button onClick={() => handleToggleStock(p)} className={`text-[9px] font-bold px-2 py-1 rounded-lg cursor-pointer transition-colors ${p.in_stock ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200" : "bg-red-100 text-red-600 hover:bg-red-200"}`}>
                {p.in_stock ? "In Stock" : "Out"}
              </button>
              <button onClick={() => handleEdit(p)} className="text-[9px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">Edit</button>
              <button onClick={() => handleDelete(p.id)} className="text-[9px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 cursor-pointer">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
