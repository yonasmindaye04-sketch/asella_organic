import { useState, useEffect } from 'react';
import { api } from '../services/api';

export interface Product {
  id: string;
  name: string;
  package_size: string;
  price: string;
  description: string;
  image_url: string;
  featured: number;
  tag: string;
  inventory_quantity: number;
  low_stock_threshold: number;
  active: number;
}

export interface Variant {
  id: string;
  package_size: string;
  price: string | number;
  inventory_quantity: number;
  low_stock_threshold: number;
  active: boolean | number;
}

export interface GroupedProduct {
  name: string;
  description: string;
  image_url: string;
  featured: boolean | number;
  tag: string;
  active: boolean | number;
  variants: Variant[];
}

export const useProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get<Product[]>('/api/products?limit=100');
      if (res.success && res.data) {
        setProducts(res.data);
      } else {
        setError(res.error || 'Failed to fetch products');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred fetching products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return { products, loading, error, refreshProducts: fetchProducts };
};

export const useGroupedProducts = () => {
  const [groupedProducts, setGroupedProducts] = useState<GroupedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroupedProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get<GroupedProduct[]>('/api/products/grouped');
      if (res.success && res.data) {
        setGroupedProducts(res.data);
      } else {
        setError(res.error || 'Failed to fetch grouped products');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred fetching grouped products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupedProducts();
  }, []);

  return { groupedProducts, loading, error, refreshGroupedProducts: fetchGroupedProducts };
};
