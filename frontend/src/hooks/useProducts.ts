import { useState, useEffect } from 'react';
import axios from 'axios';

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

export const useProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/products?limit=100');
      if (res.data.success) {
        setProducts(res.data.data);
      } else {
        setError('Failed to fetch products');
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
