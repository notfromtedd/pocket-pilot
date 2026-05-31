"use client";

import { useState, useEffect } from "react";

interface Order {
  id: string;
  status: string;
  is_emergency: boolean;
  total_price: number;
  created_at: string;
}

export default function RevenuePanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((data) => { if (data.success) setOrders(data.orders); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const delivered = orders.filter((o) => o.status === "DELIVERED");
  const pending = orders.filter((o) => o.status === "PENDING");
  const inFlight = orders.filter((o) => o.status === "IN_FLIGHT");
  const totalRevenue = delivered.reduce((s, o) => s + Number(o.total_price), 0);
  const pendingRevenue = pending.reduce((s, o) => s + Number(o.total_price), 0);
  const todayOrders = orders.filter((o) => {
    const d = new Date(o.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-[#e65328] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-[#1a202c]">Revenue Overview</h3>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
          <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Total Revenue</p>
          <p className="text-lg font-bold text-emerald-700 font-mono mt-0.5">KSh {totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center">
          <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">Pending</p>
          <p className="text-lg font-bold text-amber-700 font-mono mt-0.5">KSh {pendingRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-center">
          <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Today&apos;s Orders</p>
          <p className="text-lg font-bold text-blue-700 font-mono mt-0.5">{todayOrders.length}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">All Orders</p>
          <p className="text-lg font-bold text-slate-700 font-mono mt-0.5">{orders.length}</p>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="bg-white/50 border border-white/80 rounded-2xl p-3 space-y-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status Breakdown</p>
        <div className="space-y-1.5">
          {[
            { label: "Delivered", count: delivered.length, color: "bg-emerald-500", total: orders.length },
            { label: "In Flight", count: inFlight.length, color: "bg-[#e65328]", total: orders.length },
            { label: "Pending", count: pending.length, color: "bg-amber-400", total: orders.length },
          ].map((item) => (
            <div key={item.label}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-slate-600 font-medium">{item.label}</span>
                <span className="text-slate-800 font-bold">{item.count}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${item.color} rounded-full transition-all duration-500`}
                  style={{ width: `${item.total > 0 ? (item.count / item.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Deliveries */}
      <div className="bg-white/50 border border-white/80 rounded-2xl p-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Recent Deliveries</p>
        <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
          {delivered.slice(0, 8).map((o) => (
            <div key={o.id} className="flex justify-between items-center text-[10px]">
              <span className="text-slate-600 font-mono">ORD-{o.id.substring(0, 6).toUpperCase()}</span>
              <span className="font-bold text-emerald-600">KSh {Number(o.total_price).toLocaleString()}</span>
            </div>
          ))}
          {delivered.length === 0 && <p className="text-[10px] text-slate-400 text-center py-3">No deliveries yet</p>}
        </div>
      </div>
    </div>
  );
}
