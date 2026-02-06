import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface CartItem {
  id: string;
  type: 'pro_subscription' | 'coauthor_certificate';
  label: string;
  description: string;
  amount: number;
  coAuthorId?: string;
  articleId?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  hasItem: (id: string) => boolean;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('wwjmrd-cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('wwjmrd-cart', JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      if (prev.some(i => i.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const hasItem = useCallback((id: string) => {
    return items.some(i => i.id === id);
  }, [items]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, hasItem, itemCount: items.length }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
