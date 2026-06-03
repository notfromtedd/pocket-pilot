"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface CustomerProfile {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface PurchaseOrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price: number | string | null;
}

interface PurchaseTicket {
  id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  payload_item?: string | null;
  urgency_level?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  drone_id?: string | null;
}

interface PurchaseOrder {
  id: string;
  status?: string | null;
  is_emergency?: boolean | null;
  total_price?: number | string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_phone?: string | null;
  notes?: string | null;
  created_at?: string | null;
  customers?: CustomerProfile | null;
  order_items?: PurchaseOrderItem[];
  tickets?: PurchaseTicket[];
}

function formatCurrency(value: number | string | null | undefined) {
  return `KSh ${Number(value ?? 0).toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCoordinate(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(5) : "n/a";
}

function statusClass(status: string | null | undefined) {
  if (status === "DELIVERED") return "bg-emerald-100 text-emerald-600";
  if (status === "IN_FLIGHT") return "bg-[#e65328]/10 text-[#e65328]";
  if (status === "CANCELLED") return "bg-red-100 text-red-600";
  return "bg-amber-100 text-amber-600";
}

export default function PurchaseLogPanel() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load purchase logs");
      }
      setOrders(data.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchase logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void fetchOrders(); }, 0);

    const reload = () => { void fetchOrders(); };
    const channel = supabase
      .channel("admin-purchase-log")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, reload)
      .subscribe();

    return () => {
      window.clearTimeout(initialLoad);
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  const deliveredOrders = orders.filter((order) => order.status === "DELIVERED").length;
  const inFlightOrders = orders.filter((order) => order.status === "IN_FLIGHT").length;
  const itemCount = orders.reduce((sum, order) => {
    return sum + (order.order_items ?? []).reduce((itemSum, item) => itemSum + Number(item.quantity ?? 0), 0);
  }, 0);
  const totalValue = orders.reduce((sum, order) => sum + Number(order.total_price ?? 0), 0);

  if (loading) {
    return <div className="flex justify-center py-10"><div className="w-8 h-8 border-3 border-[#e65328] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#1a202c]">Purchase Logs</h3>
          <p className="text-[10px] text-slate-500">{orders.length} orders · {itemCount} purchased items</p>
        </div>
        <button
          onClick={() => { void fetchOrders(); }}
          disabled={refreshing}
          className="rounded-xl bg-slate-800 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2.5">
        <div className="rounded-2xl border border-white/80 bg-white/50 p-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Orders</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-slate-800">{orders.length}</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/50 p-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">In Flight</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-[#e65328]">{inFlightOrders}</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/50 p-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Delivered</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-emerald-600">{deliveredOrders}</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/50 p-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Order Value</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-slate-800">{formatCurrency(totalValue)}</p>
        </div>
      </div>

      <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-white/80 bg-white/50 px-4 py-10 text-center text-xs font-semibold text-slate-400">
            No purchases have been recorded yet.
          </div>
        ) : orders.map((order) => {
          const tickets = order.tickets ?? [];
          const primaryTicket = tickets[0];
          const items = order.order_items ?? [];
          const customerName = order.customers?.full_name || primaryTicket?.customer_name || "Customer";
          const customerContact = order.customers?.email || order.delivery_phone || primaryTicket?.customer_phone || order.customers?.phone || "No contact saved";
          const destinationLat = order.delivery_lat ?? primaryTicket?.latitude;
          const destinationLng = order.delivery_lng ?? primaryTicket?.longitude;

          return (
            <div key={order.id} className="rounded-2xl border border-white/80 bg-white/55 p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs font-bold text-slate-800">ORD-{order.id.substring(0, 6).toUpperCase()}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${statusClass(order.status)}`}>
                      {order.status ?? "PENDING"}
                    </span>
                    {order.is_emergency && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-red-600">
                        Emergency
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">{formatDate(order.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Total</p>
                  <p className="font-mono text-sm font-bold text-slate-800">{formatCurrency(order.total_price)}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[1.1fr_1.2fr_1fr]">
                <div className="rounded-xl border border-white/70 bg-white/40 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Buyer</p>
                  <p className="mt-1 text-xs font-bold text-slate-800">{customerName}</p>
                  <p className="mt-0.5 break-all text-[10px] text-slate-500">{customerContact}</p>
                </div>

                <div className="rounded-xl border border-white/70 bg-white/40 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Purchased Items</p>
                  <div className="mt-1.5 space-y-1">
                    {items.length === 0 ? (
                      <p className="text-[10px] text-slate-400">No line items saved.</p>
                    ) : items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="truncate font-semibold text-slate-700">{item.product_name} x{item.quantity}</span>
                        <span className="font-mono text-slate-500">{formatCurrency(Number(item.price ?? 0) * Number(item.quantity ?? 0))}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/70 bg-white/40 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Destination</p>
                  <p className="mt-1 font-mono text-[10px] font-semibold text-slate-700">
                    {formatCoordinate(destinationLat)}, {formatCoordinate(destinationLng)}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">Phone: {order.delivery_phone || primaryTicket?.customer_phone || "n/a"}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
                <div className="rounded-xl border border-white/70 bg-white/40 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Dispatch Ticket</p>
                  {primaryTicket ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                      <span className="font-mono font-bold text-slate-700">FLT-{primaryTicket.id.substring(0, 6).toUpperCase()}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${statusClass(primaryTicket.status)}`}>
                        {primaryTicket.status ?? "PENDING"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                        {primaryTicket.drone_id || "Unassigned drone"}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-400">No ticket linked.</p>
                  )}
                </div>

                <div className="rounded-xl border border-white/70 bg-white/40 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Notes</p>
                  <p className="mt-1 line-clamp-2 text-[10px] text-slate-600">{order.notes || primaryTicket?.payload_item || "No delivery notes saved."}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
