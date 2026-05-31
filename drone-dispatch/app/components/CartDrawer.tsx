"use client";

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

interface CartDrawerProps {
  cart: CartItem[];
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: string) => void;
  onCheckout: () => void;
  loading: boolean;
}

export default function CartDrawer({
  cart,
  isOpen,
  onClose,
  onAddToCart,
  onRemoveFromCart,
  onCheckout,
  loading,
}: CartDrawerProps) {
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white/80 backdrop-blur-2xl border-l border-white/60 shadow-[-8px_0_32px_rgba(0,0,0,0.08)] z-50 transition-transform duration-300 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200/60">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#1a202c]">Your Cart</h2>
              <p className="text-[11px] text-slate-500">
                {itemCount} item{itemCount !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <span className="text-4xl block mb-3">🛒</span>
              <p className="text-sm font-medium">Your cart is empty</p>
              <p className="text-xs mt-1">Browse supplies and add items</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.product.id}
                className="bg-white/60 border border-white/80 rounded-2xl p-3.5 flex items-center gap-3"
              >
                <span className="text-2xl flex-shrink-0">{item.product.image_emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#1a202c] truncate">
                    {item.product.name}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    KSh {item.product.price.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onRemoveFromCart(item.product.id)}
                    className="w-6 h-6 bg-slate-100 hover:bg-slate-200 rounded-md flex items-center justify-center text-xs font-bold cursor-pointer transition-colors"
                  >
                    −
                  </button>
                  <span className="text-xs font-bold text-[#e65328] w-4 text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onAddToCart(item.product)}
                    className="w-6 h-6 bg-[#e65328] hover:bg-[#d4431b] text-white rounded-md flex items-center justify-center text-xs font-bold cursor-pointer transition-colors"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs font-bold text-[#1a202c] flex-shrink-0 w-16 text-right">
                  KSh {(item.product.price * item.quantity).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="p-5 border-t border-slate-200/60 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-600">Total</span>
              <span className="text-xl font-bold text-[#1a202c]">
                KSh {total.toLocaleString()}
              </span>
            </div>
            <button
              onClick={onCheckout}
              disabled={loading}
              className="w-full bg-[#e65328] hover:bg-[#d4431b] disabled:opacity-60 text-white font-semibold py-3.5 rounded-2xl text-xs tracking-wider uppercase shadow-[0_4px_12px_rgba(230,83,40,0.25)] transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : "Dispatch Order →"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
