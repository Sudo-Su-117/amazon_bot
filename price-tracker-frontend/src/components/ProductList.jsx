import { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

// API Configuration 
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://amazon-price-tracker-api-lmu1.onrender.com';
const API_URL = `${API_BASE_URL}/api/products`;

// Log environment info for debugging
console.log('Environment:', {
  nodeEnv: process.env.NODE_ENV,
  apiUrl: API_URL,
  env: import.meta.env
});

export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: '', url: '', targetPrice: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProductData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Fetching from:', API_URL);
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include' // Important for cookies, authorization headers with HTTPS
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Products data:', data);
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const addProduct = async () => {
    if (!newProduct.name || !newProduct.url || !newProduct.targetPrice) {
      setError('Please fill in all fields');
      return;
    }
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newProduct.name,
          url: newProduct.url,
          targetPrice: Number(newProduct.targetPrice)
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add product');
      }
      
      setNewProduct({ name: '', url: '', targetPrice: '' });
      await fetchProductData();
    } catch (err) {
      alert('Error adding product');
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json'
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete product');
      }
      
      await fetchProductData();
    } catch (err) {
      console.error('Error deleting product:', err);
      setError(err.message || 'Error deleting product');
    }
  };

  useEffect(() => {
    fetchProductData();
  }, []);

  return (
    <div className="tracker-container">
      <h1>Amazon Price Tracker</h1>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      {isLoading ? (
        <div className="loading-message">
          Loading products...
        </div>
      ) : (
        <div className="add-product-section">
          <h2>Add New Product</h2>
          <form 
            className="product-form" 
            onSubmit={(e) => {
              e.preventDefault();
              addProduct();
            }}
          >
            <div className="form-group">
              <label htmlFor="product-name">Product Name</label>
              <input
                id="product-name"
                type="text"
                placeholder="e.g., Wireless Earbuds"
                value={newProduct.name}
                onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="product-url">Amazon URL</label>
              <input
                id="product-url"
                type="url"
                placeholder="https://www.amazon.in/..."
                value={newProduct.url}
                onChange={(e) => setNewProduct({...newProduct, url: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="target-price">Target Price (₹)</label>
              <input
                id="target-price"
                type="number"
                placeholder="e.g., 2999"
                min="1"
                step="0.01"
                value={newProduct.targetPrice}
                onChange={(e) => setNewProduct({...newProduct, targetPrice: e.target.value})}
                required
              />
            </div>
            
            <button type="submit" className="add-button" disabled={isLoading}>
              {isLoading ? 'Adding...' : 'Add Product'}
            </button>
          </form>
        </div>
      )}
      
      <div className="product-grid">
        {products.map(p => (
          <div className="product-card" key={p._id}>
            <h3>{p.name}</h3>
            <p>
              <strong>Current:</strong> ₹{p.currentPrice ?? 'N/A'}
              <br />
              <strong>Target:</strong> ₹{p.targetPrice}
            </p>
            <p className="timestamp">
              {p.lastChecked ? `Last Checked: ${new Date(p.lastChecked).toLocaleString()}` : 'Not Checked Yet'}
            </p>
            <a href={p.url} target="_blank" rel="noreferrer" className="view-link">🔗 View on Amazon</a>
            <button className="delete-btn" onClick={() => deleteProduct(p._id)}>❌ Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
