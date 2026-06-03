"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { getSession, signOut, type UserSession } from "../lib/auth";
import ProductGrid from "../components/ProductGrid";
import CartDrawer from "../components/CartDrawer";
import OrderHistory from "../components/OrderHistory";
import EmergencyPanel from "../components/EmergencyPanel";
import GlovoMapWrapper from "../components/GlovoMapWrapper";

// ── Types ──

type Tab = "shop" | "orders" | "emergency";
type FlightStatus = "idle" | "pending_admin" | "airborne" | "delivered";

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

interface DroneTelemetry {
  lat: number;
  lng: number;
  battery: number;
  speed: number;
  phase?: string;
}

const STATUS_STEPS = [
  { key: "pending_admin", label: "Ordered", icon: "📋" },
  { key: "launched", label: "Launched", icon: "🚀" },
  { key: "airborne", label: "In Transit", icon: "🚁" },
  { key: "delivered", label: "Delivered", icon: "📦" },
];

function getStepState(stepKey: string, status: FlightStatus): "done" | "active" | "pending" {
  const order = ["pending_admin", "launched", "airborne", "delivered"];
  const idx = order.indexOf(status === "delivered" ? "delivered" : status);
  const sIdx = order.indexOf(stepKey);
  if (sIdx < idx) return "done";
  if (sIdx === idx) return "active";
  return "pending";
}

// ── Component ──

export default function CustomerView() {
  const router = useRouter();

  // Auth
  const [user, setUser] = useState<UserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Tabs & Cart
  const [activeTab, setActiveTab] = useState<Tab>("shop");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  // GPS
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>({ lat: -1.2880, lng: 36.8220 });

  // Tracking
  const [trackingMode, setTrackingMode] = useState(false);
  const [flightStatus, setFlightStatus] = useState<FlightStatus>("idle");
  const [dronePosition, setDronePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [battery, setBattery] = useState(100);
  const [speed, setSpeed] = useState(0);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingTicketId, setTrackingTicketId] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[]>([]);

  // ── Auth check ──
  useEffect(() => {
    getSession().then((s) => {
      setUser(s);
      setAuthLoading(false);
      if (!s) router.push("/auth");
    });
  }, [router]);

  // ── GPS ──
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, []);

  // ── Shared telemetry applier (component level so both effects can use it) ──
  const applyTelemetry = useCallback((t: DroneTelemetry & { route_path?: { lat: number; lng: number }[] }) => {
    if (t.phase === "RETURNING" || t.phase === "DELIVERED") {
      setFlightStatus("delivered");
      return;
    }

    if (t.lat && t.lng) {
      setDronePosition({ lat: t.lat, lng: t.lng });
      setBattery(t.battery);
      setSpeed(t.speed);
      setFlightStatus("airborne");
    }
    if (Array.isArray(t.route_path) && t.route_path.length > 1) {
      setRoutePath(t.route_path);
    }
  }, []);

  // ── Tracking: order-level subscriptions (status + order_id fallback telemetry) ──
  useEffect(() => {
    if (!trackingMode || !trackingOrderId) return;

    const fetchLatestTelemetry = async () => {
      // 1. Try to get ticket_id from the tickets table (needed for reliable telemetry query)
      let ticketId = trackingTicketId;
      if (!ticketId) {
        const { data: td } = await supabase
          .from("tickets")
          .select("id")
          .eq("order_id", trackingOrderId)
          .maybeSingle();
        if (td?.id) { ticketId = td.id; setTrackingTicketId(td.id); }
      }

      // 2. Fetch telemetry: ticket_id is the reliable key (admin upserts by it);
      //    fall back to order_id for older rows
      const sel = "lat,lng,battery,speed,phase,ticket_id,route_path";
      const { data } = await (
        ticketId
          ? supabase.from("drone_telemetry").select(sel).eq("ticket_id", ticketId).maybeSingle()
          : supabase.from("drone_telemetry").select(sel).eq("order_id", trackingOrderId).maybeSingle()
      );

      if (data) {
        applyTelemetry(data as DroneTelemetry & { route_path?: { lat: number; lng: number }[] });
        const tid = (data as { ticket_id?: string }).ticket_id;
        if (tid) setTrackingTicketId(tid);
      }
    };

    fetchLatestTelemetry();

    // Ticket status changes (DELIVERED, etc.)
    const tickCh = supabase
      .channel(`cust-tick-${trackingOrderId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "tickets",
        filter: `order_id=eq.${trackingOrderId}`,
      }, (p) => {
        const u = p.new as { status: string };
        if (u.status === "IN_FLIGHT") setFlightStatus("airborne");
        if (u.status === "DELIVERED") setFlightStatus("delivered");
      })
      .subscribe();

    // Telemetry by order_id as fallback (fires when admin has order_id set on the row)
    const telCh = supabase
      .channel(`cust-tel-oid-${trackingOrderId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "drone_telemetry",
        filter: `order_id=eq.${trackingOrderId}`,
      }, (p) => {
        const t = p.new as DroneTelemetry & { ticket_id?: string; route_path?: { lat: number; lng: number }[] };
        applyTelemetry(t);
        if (t.ticket_id) setTrackingTicketId(t.ticket_id);
      })
      .subscribe();

    return () => { supabase.removeChannel(tickCh); supabase.removeChannel(telCh); };
  }, [trackingMode, trackingOrderId, trackingTicketId, applyTelemetry]);

  // ── Tracking: ticket_id telemetry subscription (reliable — matches admin upsert key) ──
  useEffect(() => {
    if (!trackingMode || !trackingTicketId) return;

    const telCh = supabase
      .channel(`cust-tel-tid-${trackingTicketId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "drone_telemetry",
        filter: `ticket_id=eq.${trackingTicketId}`,
      }, (p) => {
        applyTelemetry(p.new as DroneTelemetry & { route_path?: { lat: number; lng: number }[] });
      })
      .subscribe();

    return () => { supabase.removeChannel(telCh); };
  }, [trackingMode, trackingTicketId, applyTelemetry]);

  // ── Cart operations ──
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) return prev.map((c) => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === productId);
      if (existing && existing.quantity > 1) return prev.map((c) => c.product.id === productId ? { ...c, quantity: c.quantity - 1 } : c);
      return prev.filter((c) => c.product.id !== productId);
    });
  }, []);

  // ── Checkout ──
  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: user?.id || null,
          customer_name: user?.fullName || "Customer",
          items: cart.map((c) => ({
            product_id: c.product.id,
            product_name: c.product.name,
            quantity: c.quantity,
            price: c.product.price,
            priority_level: c.product.priority_level,
          })),
          delivery_lat: coords?.lat || -1.2880,
          delivery_lng: coords?.lng || 36.8220,
          delivery_phone: user?.phone || "",
          notes: "",
          is_emergency: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCart([]);
        setCartOpen(false);
        setTrackingOrderId(data.order.id);
        setTrackingTicketId(data.ticket?.id || null);
        setFlightStatus("pending_admin");
        setTrackingMode(true);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Order failed. Please try again.");
    }
    setCheckingOut(false);
  };

  // ── Emergency submit ──
  const handleEmergencySubmit = async (notes: string) => {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: user?.id || null,
          customer_name: user?.fullName || "Customer",
          items: [{ product_id: null, product_name: "Emergency Supplies", quantity: 1, price: 0, priority_level: "CRITICAL" }],
          delivery_lat: coords?.lat || -1.2880,
          delivery_lng: coords?.lng || 36.8220,
          delivery_phone: user?.phone || "",
          notes,
          is_emergency: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTrackingOrderId(data.order.id);
        setTrackingTicketId(data.ticket?.id || null);
        setFlightStatus("pending_admin");
        setTrackingMode(true);
      }
    } catch (err) {
      console.error("Emergency submit error:", err);
    }
  };

  // ── Track from order history ──
  const handleTrackOrder = (orderId: string) => {
    setTrackingOrderId(orderId);
    setTrackingTicketId(null);
    setFlightStatus("pending_admin");
    setTrackingMode(true);
  };

  // ── Loading ──
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-[#e65328] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── TRACKING MODE ──
  if (trackingMode) {
    const targetPos = coords || { lat: -1.288, lng: 36.822 };
    return (
      <div className="relative h-screen w-full bg-[#f0f2f5] flex flex-col font-sans antialiased overflow-hidden">
        <div className="flex-[0_0_60%] relative">
          <GlovoMapWrapper dronePosition={dronePosition} targetPosition={targetPos} customerPosition={targetPos} routePath={routePath} />
          <button onClick={() => { setTrackingMode(false); setFlightStatus("idle"); setDronePosition(null); setTrackingTicketId(null); setRoutePath([]); }}
            className="absolute top-4 left-4 z-20 bg-white/80 backdrop-blur-md border border-white/60 rounded-full w-10 h-10 flex items-center justify-center shadow-md cursor-pointer hover:bg-white">
            <span className="text-sm">←</span>
          </button>
          {trackingOrderId && (
            <div className="absolute top-4 right-4 z-20 bg-white/80 backdrop-blur-md border border-white/60 rounded-full px-4 py-2 shadow-md">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">ORD-{trackingOrderId.substring(0, 6).toUpperCase()}</p>
              {trackingTicketId && <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">FLT-{trackingTicketId.substring(0, 5).toUpperCase()}</p>}
            </div>
          )}
        </div>

        <div className="flex-[0_0_40%] bg-white/60 backdrop-blur-xl border-t border-white/80 rounded-t-3xl px-6 py-5 shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.06)] flex flex-col">
          <div className="flex items-center justify-between mb-4 px-2">
            {STATUS_STEPS.map((step, i) => {
              const state = getStepState(step.key, flightStatus);
              return (
                <div key={step.key} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm mb-1 transition-all duration-500 ${
                      state === "done" ? "bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.4)]"
                      : state === "active" ? "bg-[#e65328] text-white shadow-[0_2px_8px_rgba(230,83,40,0.4)] step-pulse"
                      : "bg-slate-200 text-slate-400"
                    }`}>{state === "done" ? "✓" : step.icon}</div>
                    <p className={`text-[9px] font-bold uppercase tracking-wider ${state === "pending" ? "text-slate-400" : "text-slate-700"}`}>{step.label}</p>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`w-8 sm:w-12 h-0.5 mx-1 mb-4 rounded-full transition-colors duration-500 ${
                      getStepState(STATUS_STEPS[i + 1].key, flightStatus) !== "pending" ? "bg-emerald-400" : "bg-slate-200"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex-1 flex items-center gap-4">
            <div className="shrink-0 relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle cx="32" cy="32" r="28" fill="none" stroke={battery > 50 ? "#10b981" : battery > 25 ? "#f59e0b" : "#ef4444"} strokeWidth="4" strokeDasharray={`${(battery / 100) * 175.9} 175.9`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl">🚁</span></div>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-sm border border-white/60 rounded-full px-2 py-0.5">
                <p className="text-[9px] font-mono font-bold text-slate-600">{battery}%</p>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2.5">
              <div className="bg-white/40 border border-white/60 rounded-xl p-2.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Speed</p>
                <p className="text-sm font-mono font-bold text-slate-700">{speed} km/h</p>
              </div>
              <div className="bg-white/40 border border-white/60 rounded-xl p-2.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Status</p>
                <p className="text-sm font-bold text-[#e65328] uppercase">{flightStatus === "pending_admin" ? "Queued" : flightStatus === "airborne" ? "In Flight" : flightStatus === "delivered" ? "Delivered ✓" : "—"}</p>
              </div>
            </div>
          </div>

          {flightStatus === "delivered" && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
              <p className="text-sm font-bold text-emerald-700">🎉 Your delivery has arrived!</p>
              <p className="text-xs text-emerald-600 mt-0.5">Please collect your package.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── MAIN HUB ──
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "shop", label: "Shop", icon: "🏪" },
    { key: "orders", label: "Orders", icon: "📦" },
    { key: "emergency", label: "Emergency", icon: "🚨" },
  ];

  return (
    <div className="relative min-h-screen bg-[#f0f2f5] font-sans antialiased">
      <div className="absolute inset-0 bg-linear-to-tr from-[#dfebd4] via-[#e2e9e1] to-[#f3e7dc] z-0" />

      <div className="relative z-10 max-w-md mx-auto px-4 pb-6">
        {/* Header */}
        <div className="pt-6 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1a202c]">
              Hey, {user?.fullName?.split(" ")[0] || "there"} 👋
            </h1>
            <p className="text-[11px] text-slate-500">Pocket Pilot · Nairobi</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Cart button */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative w-10 h-10 bg-white/50 backdrop-blur-sm border border-white/60 rounded-full flex items-center justify-center shadow-sm cursor-pointer hover:bg-white/80 transition-colors"
            >
              <span className="text-lg">🛒</span>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#e65328] text-white text-[9px] font-bold rounded-full flex items-center justify-center">{cartCount}</span>
              )}
            </button>
            {/* Sign out */}
            <button
              onClick={async () => { await signOut(); router.push("/auth"); }}
              className="w-10 h-10 bg-white/50 backdrop-blur-sm border border-white/60 rounded-full flex items-center justify-center shadow-sm cursor-pointer hover:bg-white/80 transition-colors"
            >
              <span className="text-sm">👤</span>
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex bg-white/50 backdrop-blur-sm border border-white/60 rounded-full p-1 mb-5 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-full text-[11px] font-bold tracking-wider transition-all cursor-pointer ${
                activeTab === tab.key ? (tab.key === "emergency" ? "bg-red-600 text-white" : "bg-slate-800 text-white") : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "shop" && (
          <ProductGrid cart={cart} onAddToCart={addToCart} onRemoveFromCart={removeFromCart} />
        )}

        {activeTab === "orders" && (
          <OrderHistory customerId={user?.id || null} onTrackOrder={handleTrackOrder} />
        )}

        {activeTab === "emergency" && (
          <EmergencyPanel
            userPhone={user?.phone || ""}
            userName={user?.fullName || ""}
            coords={coords}
            onEmergencySubmit={handleEmergencySubmit}
          />
        )}
      </div>

      {/* Cart Drawer */}
      <CartDrawer
        cart={cart}
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        onAddToCart={addToCart}
        onRemoveFromCart={removeFromCart}
        onCheckout={handleCheckout}
        loading={checkingOut}
      />
    </div>
  );
}
