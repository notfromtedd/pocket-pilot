"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  status: string;
  is_emergency: boolean;
  total_price: number;
  notes: string;
  created_at: string;
  order_items: OrderItem[];
}

interface OrderHistoryProps {
  customerId: string | null;
  onTrackOrder: (orderId: string) => void;
}

export default function OrderHistory({ customerId, onTrackOrder }: OrderHistoryProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      const url = customerId ? `/api/orders?customer_id=${customerId}` : "/api/orders";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setOrders(data.orders);
      setLoading(false);
    };
    fetchOrders();

    // Realtime subscription for order updates
    const channel = supabase
      .channel("order-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [customerId]);

  const statusColor = (status: string) => {
    switch (status) {
      case "PENDING": return "bg-amber-100 text-amber-700";
      case "IN_FLIGHT": return "bg-[#e65328]/10 text-[#e65328]";
      case "DELIVERED": return "bg-emerald-100 text-emerald-700";
      default: return "bg-slate-100 text-slate-600";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-[#e65328] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <span className="text-4xl block mb-3">📦</span>
        <p className="text-sm font-medium">No orders yet</p>
        <p className="text-xs mt-1">Your order history will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <div
          key={order.id}
          className={`bg-white/50 border rounded-2xl p-4 transition-all ${
            order.is_emergency ? "border-red-300 bg-red-50/50" : "border-white/80"
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                {order.is_emergency && <span className="text-sm">🚨</span>}
                <span className="text-[11px] font-bold text-slate-800">
                  ORD-{order.id.substring(0, 6).toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {new Date(order.created_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusColor(order.status)}`}>
              {order.status === "IN_FLIGHT" ? "In Flight" : order.status}
            </span>
          </div>

          {/* Items */}
          <div className="space-y-1 mb-3">
            {order.order_items?.map((item) => (
              <div key={item.id} className="flex justify-between text-xs">
                <span className="text-slate-600">{item.product_name} × {item.quantity}</span>
                <span className="text-slate-700 font-medium">KSh {(item.price * item.quantity).toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
            <span className="text-xs font-bold text-[#1a202c]">
              KSh {order.total_price.toLocaleString()}
            </span>
            {(order.status === "PENDING" || order.status === "IN_FLIGHT") && (
              <button
                onClick={() => onTrackOrder(order.id)}
                className="text-[10px] font-bold text-[#e65328] hover:text-[#d4431b] cursor-pointer transition-colors uppercase tracking-wider"
              >
                Track →
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
