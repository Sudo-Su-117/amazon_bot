import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

// Sparkline graph component for price history
function Sparkline({ history, isAlertMet }) {
  if (!history || history.length < 2) {
    return (
      <div className="sparkline-container">
        <span className="sparkline-title">Price Trend</span>
        <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
          <line x1="0" y1="15" x2="100" y2="15" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3,3" />
        </svg>
      </div>
    );
  }

  const prices = history.map(h => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min === 0 ? 1 : max - min;

  // Map to SVG coordinates: width 100, height 30
  const points = history.map((h, i) => {
    const x = (i / (history.length - 1)) * 100;
    const y = 30 - ((h.price - min) / range) * 24 - 3; // 3px padding top/bottom
    return { x, y };
  });

  const pathD = `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`;
  const strokeColor = isAlertMet ? 'var(--color-success)' : 'var(--text-secondary)';

  return (
    <div className={`sparkline-container ${isAlertMet ? 'sparkline-card-met' : ''}`}>
      <span className="sparkline-title">Price History ({history.length} scans)</span>
      <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
        <path d={pathD} className="sparkline-line" stroke={strokeColor} />
      </svg>
    </div>
  );
}

function App() {
  const [products, setProducts] = useState([]);
  const [editProductId, setEditProductId] = useState(null);
  const [form, setForm] = useState({ name: '', url: '', targetPrice: '', email: '' });
  const [editedTargetPrice, setEditedTargetPrice] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scanAllLoading, setScanAllLoading] = useState(false);
  const [error, setError] = useState('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [scanningIds, setScanningIds] = useState({});
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  // Use environment variable for API base URL, with auto-detection for local development
  const getApiUrl = () => {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:5000/api/products';
    }
    return `${import.meta.env.VITE_API_URL || 'https://amazon-price-tracker-api-lmu1.onrender.com'}/api/products`;
  };
  const API_BASE = getApiUrl();

  // Apply theme to document documentElement
  useEffect(() => {
    document.documentElement.className = theme === 'light' ? 'theme-light' : 'theme-dark';
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Toast Helper
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
  };

  const fetchProducts = async (showSuccessToast = false) => {
    setLoadingProducts(true);
    try {
      const res = await axios.get(API_BASE);
      if (res.data && Array.isArray(res.data)) {
        setProducts(res.data);
      } else if (res.data && typeof res.data === 'object' && res.data.products) {
        setProducts(Array.isArray(res.data.products) ? res.data.products : []);
      } else {
        setError('Unexpected response format from server');
        setProducts([]);
      }
      if (showSuccessToast) {
        showToast('Products loaded successfully', 'success');
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(`Failed to fetch products: ${err.message}. Ensure backend is running.`);
      setProducts([]);
      showToast('Failed to load products', 'error');
    } finally {
      setLoadingProducts(false);
      if (isInitialLoad) setIsInitialLoad(false);
    }
  };

  const handleInputChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleUpdate = async (id, updatedProduct) => {
    try {
      const res = await axios.put(`${API_BASE}/${id}`, {
        targetPrice: Number(updatedProduct.targetPrice),
        email: updatedProduct.email,
      });
      showToast('Product updated successfully', 'success');
      
      // Update local state directly to prevent full loading spinner
      setProducts(products.map(p => p._id === id ? { ...p, targetPrice: Number(updatedProduct.targetPrice), email: updatedProduct.email } : p));
      setEditProductId(null);
    } catch (err) {
      console.error(err);
      showToast('Failed to update product settings', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await axios.post(API_BASE, form);
      setForm({ name: '', url: '', targetPrice: '', email: '' });
      showToast('Product added for tracking!', 'success');
      await fetchProducts();
    } catch (err) {
      setError('Failed to add product. Please verify inputs.');
      showToast('Failed to add product', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to stop tracking "${name}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/${id}`);
      showToast('Product deleted', 'success');
      setProducts(products.filter(p => p._id !== id));
    } catch (err) {
      showToast('Failed to delete product', 'error');
    }
  };

  const handleScanProduct = async (id, name) => {
    setScanningIds(prev => ({ ...prev, [id]: true }));
    showToast(`Scanning price for "${name}"...`, 'info');
    try {
      const res = await axios.post(`${API_BASE}/${id}/scan`);
      if (res.data) {
        // Update local state with newly scanned details
        setProducts(products.map(p => p._id === id ? res.data : p));
        
        const priceMet = res.data.currentPrice <= res.data.targetPrice;
        if (priceMet) {
          showToast(`💥 Price dropped for "${name}" to ₹${res.data.currentPrice}! Alert sent.`, 'success');
        } else {
          showToast(`Scan complete: Current price for "${name}" is ₹${res.data.currentPrice}`, 'success');
        }
      }
    } catch (err) {
      console.error('Scan failed:', err);
      showToast(`Scrape failed for "${name}": ${err.response?.data?.error || err.message}`, 'error');
    } finally {
      setScanningIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleScanAll = async () => {
    setScanAllLoading(true);
    showToast('Background scrape initiated for all products', 'info');
    try {
      await axios.post(`${API_BASE}/scan-all`);
      showToast('Triggered scan cycle successfully', 'success');
    } catch (err) {
      showToast('Failed to initiate global scan', 'error');
    } finally {
      setScanAllLoading(false);
      // Wait 2.5 seconds and check database to fetch any initial quick updates
      setTimeout(() => fetchProducts(), 2500);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Stats Calculations
  const totalTracked = products.length;
  const priceAlertsMet = products.filter(p => p.currentPrice && p.currentPrice <= p.targetPrice).length;
  const avgTargetPrice = products.length > 0 
    ? Math.round(products.reduce((acc, p) => acc + p.targetPrice, 0) / products.length)
    : 0;

  return (
    <div className="app-container">
      {/* Dynamic Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span className={`toast-icon ${toast.type}-icon`}>
              {toast.type === 'success' && '✅'}
              {toast.type === 'error' && '❌'}
              {toast.type === 'info' && 'ℹ️'}
            </span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Banner / Navigation */}
      <div className="banner">
        <div className="header-content">
          <div className="logo-wrapper">
            <span className="logo-icon">🛒</span>
            <h1 className="tracker-title">Amazon Price Tracker</h1>
          </div>
          <div className="global-actions">
            <button 
              className="btn-trigger-all" 
              onClick={handleScanAll} 
              disabled={scanAllLoading || products.length === 0}
            >
              {scanAllLoading ? (
                <>
                  <span className="spinner-small"></span> Triggers Running
                </>
              ) : (
                <>⏰ Trigger Full Scan</>
              )}
            </button>
            <button 
              className="btn-theme-toggle" 
              onClick={toggleTheme}
              title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </div>

      <div className="container">
        {/* Statistics Panels */}
        <div className="stats-grid">
          <div className="stat-card">
            <div>
              <p className="stat-title">Total Items Tracked</p>
              <p className="stat-value">{totalTracked}</p>
            </div>
            <p className="stat-desc">Products actively monitored</p>
          </div>
          
          <div className="stat-card">
            <div>
              <p className="stat-title">Price Alerts Met</p>
              <p className="stat-value" style={{ color: priceAlertsMet > 0 ? 'var(--color-success)' : 'inherit' }}>
                {priceAlertsMet}
              </p>
            </div>
            <p className="stat-desc">Currently at/below target price</p>
          </div>

          <div className="stat-card">
            <div>
              <p className="stat-title">Average Target Price</p>
              <p className="stat-value">₹{avgTargetPrice}</p>
            </div>
            <p className="stat-desc">Average threshold across items</p>
          </div>

          <div className="stat-card">
            <div>
              <p className="stat-title">Tracker Status</p>
              <p className="stat-value" style={{ color: 'var(--color-success)', fontSize: '1.6rem' }}>Active</p>
            </div>
            <p className="stat-desc">Daily cron scan enabled</p>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="error-container">
            <span>⚠️ {error}</span>
            <button className="error-close" onClick={() => setError('')}>×</button>
          </div>
        )}

        {/* Product Submission Form Card */}
        <div className="product-form-container">
          <h2 className="form-section-header">Add Product to Watchlist</h2>
          <form onSubmit={handleSubmit} className="product-form">
            <div className="form-group">
              <label>Product Name</label>
              <input
                type="text"
                name="name"
                placeholder="e.g. Wireless Headset"
                value={form.name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Amazon Product URL</label>
              <input
                type="url"
                name="url"
                placeholder="https://www.amazon.in/dp/..."
                value={form.url}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Target Price (₹)</label>
              <input
                type="number"
                name="targetPrice"
                placeholder="Threshold amount"
                value={form.targetPrice}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Email Alert Recipient</label>
              <input
                type="email"
                name="email"
                placeholder="yourname@gmail.com"
                value={form.email}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-submit-group">
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? <span className="spinner-small"></span> : 'Add Product'}
              </button>
            </div>
          </form>
        </div>

        {/* Dynamic Watchlist Section */}
        <div className="products-section-header">
          <h2 className="products-section-title">Your Watchlist</h2>
        </div>

        {loadingProducts && products.length === 0 ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading your tracked products...</p>
          </div>
        ) : !products || products.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">📉</span>
            <h3>No products found</h3>
            <p>Paste an Amazon product link above, set your desired target price, and add it to start tracking deals!</p>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => {
              const isAlertMet = product.currentPrice && product.currentPrice <= product.targetPrice;
              const hasScanned = product.currentPrice !== null;
              
              return (
                <div key={product._id} className={`product-card ${isAlertMet ? 'price-alert-met' : ''}`}>
                  <div className="card-top">
                    <div className="card-badge-row">
                      <span className={`alert-badge ${isAlertMet ? 'met' : 'pending'}`}>
                        {isAlertMet ? '💥 Deal Found' : '⏳ Tracking'}
                      </span>
                      <span className="status-badge">
                        <span className={`pulse-dot ${hasScanned ? 'success' : ''}`}></span>
                        {hasScanned ? 'Online' : 'Pending Initial Scan'}
                      </span>
                    </div>
                    <h3 className="product-title" title={product.name}>
                      {product.name}
                    </h3>
                  </div>

                  {/* Inline Editor Tab */}
                  {editProductId === product._id ? (
                    <div className="edit-tab-container">
                      <p className="edit-title">Edit Threshold</p>
                      <div className="edit-controls">
                        <input
                          type="number"
                          className="edit-input"
                          placeholder="New Target Price"
                          value={editedTargetPrice}
                          onChange={(e) => setEditedTargetPrice(e.target.value)}
                        />
                        <input
                          type="email"
                          className="edit-input"
                          placeholder="New Alert Email"
                          value={editedEmail}
                          onChange={(e) => setEditedEmail(e.target.value)}
                        />
                        <div className="edit-actions">
                          <button 
                            className="btn-card btn-save"
                            onClick={() => {
                              handleUpdate(product._id, {
                                targetPrice: editedTargetPrice,
                                email: editedEmail
                              });
                            }}
                          >
                            Save
                          </button>
                          <button className="btn-card btn-cancel" onClick={() => setEditProductId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Price Matrix block */}
                      <div className="prices-area">
                        <div>
                          <p className="price-label">Current</p>
                          <p className={`price-val current ${isAlertMet ? 'discounted' : ''}`}>
                            {hasScanned ? `₹${product.currentPrice}` : 'Waiting Scan'}
                          </p>
                        </div>
                        <div>
                          <p className="price-label">Target</p>
                          <p className="price-val target">₹{product.targetPrice}</p>
                        </div>
                      </div>

                      {/* SVG price history graph sparkline */}
                      <Sparkline history={product.priceHistory} isAlertMet={isAlertMet} />

                      {/* Details (Alert target, view link, timestamp) */}
                      <div className="product-details">
                        <div className="detail-item">
                          <span className="detail-icon">📧</span>
                          <span className="detail-text" title={product.email}>Alerts: {product.email}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-icon">🔗</span>
                          <a 
                            href={product.url} 
                            className="view-link" 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            View Amazon Listing
                          </a>
                        </div>
                        <p className="timestamp">
                          Last Scraped: {product.lastChecked ? new Date(product.lastChecked).toLocaleString() : 'Never checked'}
                        </p>
                      </div>
                    </>
                  )}

                  {/* Actions Bar */}
                  <div className="card-actions">
                    <button 
                      className="btn-card btn-scan" 
                      onClick={() => handleScanProduct(product._id, product.name)}
                      disabled={scanningIds[product._id]}
                    >
                      {scanningIds[product._id] ? (
                        <>
                          <span className="spinner-small"></span> Scanning
                        </>
                      ) : (
                        <>🔍 Scan Now</>
                      )}
                    </button>
                    <button 
                      className="btn-card btn-edit" 
                      onClick={() => {
                        setEditedTargetPrice(product.targetPrice);
                        setEditedEmail(product.email);
                        setEditProductId(product._id);
                      }}
                      disabled={scanningIds[product._id]}
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      className="btn-card btn-delete" 
                      onClick={() => handleDelete(product._id, product.name)}
                      disabled={scanningIds[product._id]}
                    >
                      🗑️ Stop
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
