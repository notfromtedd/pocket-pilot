import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json();
  const { customer_id, items, delivery_lat, delivery_lng, delivery_phone, notes, is_emergency, customer_name } = body;

  if (!items || items.length === 0) {
    return NextResponse.json({ success: false, error: 'Order must have at least one item' }, { status: 400 });
  }

  const total = items.reduce(
    (sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity, 0
  );

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_id: customer_id || null,
      status: 'PENDING',
      is_emergency: is_emergency || false,
      total_price: total,
      delivery_lat: delivery_lat || -1.2880,
      delivery_lng: delivery_lng || 36.8220,
      delivery_phone: delivery_phone || '',
      notes: notes || '',
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json({ success: false, error: orderError?.message || 'Failed' }, { status: 500 });
  }

  const orderItems = items.map((item: { product_id: string; product_name: string; quantity: number; price: number }) => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity,
    price: item.price,
  }));

  await supabase.from('order_items').insert(orderItems);

  const payloadSummary = items.map((i: { product_name: string; quantity: number }) => `${i.product_name} x${i.quantity}`).join(', ');
  const urgency = is_emergency ? 'CRITICAL' :
    items.some((i: { priority_level?: string }) => i.priority_level === 'CRITICAL') ? 'CRITICAL' :
    items.some((i: { priority_level?: string }) => i.priority_level === 'HIGH') ? 'HIGH' : 'STANDARD';

  const { data: ticket, error: ticketError } = await supabase.from('tickets').insert({
    customer_name: customer_name || 'Customer',
    customer_phone: delivery_phone || '',
    payload_item: payloadSummary.substring(0, 100),
    urgency_level: urgency,
    incident_summary: is_emergency ? `🚨 EMERGENCY: ${notes || payloadSummary}` : `Order: ${payloadSummary}`,
    latitude: delivery_lat || -1.2880,
    longitude: delivery_lng || 36.8220,
    status: 'PENDING',
    order_id: order.id,
  }).select().single();

  if (ticketError || !ticket) {
    return NextResponse.json({ success: false, error: ticketError?.message || 'Failed to create ticket' }, { status: 500 });
  }

  return NextResponse.json({ success: true, order, ticket });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customer_id');

  let query = supabase
    .from('orders')
    .select('*, customers(full_name, email, phone), order_items(*), tickets(id, customer_name, customer_phone, payload_item, urgency_level, latitude, longitude, status, drone_id)')
    .order('created_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, orders: data });
}
