import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

// GET — Fetch all products
export async function GET() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, products: data });
}

// POST — Create a new product (admin)
export async function POST(request: Request) {
  const body = await request.json();
  const { name, description, category, price, image_emoji, priority_level } = body;

  if (!name || !category) {
    return NextResponse.json({ success: false, error: 'Name and category required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      name,
      description: description || '',
      category,
      price: price || 0,
      image_emoji: image_emoji || '💊',
      priority_level: priority_level || 'STANDARD',
      in_stock: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, product: data });
}

// PUT — Update a product (admin)
export async function PUT(request: Request) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ success: false, error: 'Product ID required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, product: data });
}

// DELETE — Remove a product (admin)
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'Product ID required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
