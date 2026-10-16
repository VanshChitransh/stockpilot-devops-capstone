import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-IN');

// same-origin calls: nginx (compose) or the ingress (k8s) routes /api to the backend
async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = Array.isArray(body.detail) ? body.detail.map((d) => d.msg).join(', ') : body.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

const EMPTY_PRODUCT = { sku: '', name: '', category: 'General', quantity: 0, reorder_level: 10, unit_price: 0, supplier: '' };

function stockState(p) {
  if (p.quantity === 0) return { label: 'Out of stock', tone: 'danger' };
  if (p.low_stock) return { label: 'Low stock', tone: 'warn' };
  return { label: 'In stock', tone: 'ok' };
}

function timeAgo(iso) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-hint">{hint}</span>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        {children}
      </div>
    </div>
  );
}

function ProductForm({ initial, categories, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        ...form,
        quantity: Number(form.quantity),
        reorder_level: Number(form.reorder_level),
        unit_price: Number(form.unit_price).toFixed(2),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label>SKU<input required maxLength={40} value={form.sku} onChange={set('sku')} placeholder="KB-001" /></label>
        <label>Category
          <input list="categories" maxLength={80} value={form.category} onChange={set('category')} />
          <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
      </div>
      <label>Product name<input required maxLength={200} value={form.name} onChange={set('name')} placeholder="Mechanical keyboard" /></label>
      <div className="form-row three">
        {initial.id === undefined && (
          <label>Opening stock<input type="number" min="0" required value={form.quantity} onChange={set('quantity')} /></label>
        )}
        <label>Reorder at<input type="number" min="0" required value={form.reorder_level} onChange={set('reorder_level')} /></label>
        <label>Unit price (₹)<input type="number" min="0" step="0.01" required value={form.unit_price} onChange={set('unit_price')} /></label>
      </div>
      <label>Supplier<input maxLength={120} value={form.supplier} onChange={set('supplier')} placeholder="Optional" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-foot">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save product'}</button>
      </footer>
    </form>
  );
}

function MovementForm({ product, onSubmit, onCancel }) {
  const [reason, setReason] = useState('RESTOCK');
  const [amount, setAmount] = useState(10);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const sign = reason === 'SALE' ? -1 : 1;

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await onSubmit({ change: sign * Math.abs(Number(amount)), reason, note });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <p className="muted">{product.name} · <b>{number.format(product.quantity)}</b> units on hand</p>
      <div className="segmented" role="radiogroup" aria-label="Movement type">
        {['RESTOCK', 'SALE', 'ADJUSTMENT'].map((r) => (
          <button type="button" key={r} role="radio" aria-checked={reason === r}
            className={reason === r ? 'active' : ''} onClick={() => setReason(r)}>
            {r.charAt(0) + r.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <label>{reason === 'SALE' ? 'Units sold' : reason === 'RESTOCK' ? 'Units received' : 'Units to add (use negative to remove)'}
        <input type="number" required value={amount} min={reason === 'ADJUSTMENT' ? undefined : 1}
          onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label>Note<input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="PO number, invoice, reason…" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-foot">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary">Record movement</button>
      </footer>
    </form>
  );
}

function App() {
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState(null); // product being created/edited
  const [moving, setMoving] = useState(null); // product getting a stock movement

  const refresh = useCallback(async () => {
    try {
      const [p, s, m] = await Promise.all([api('/api/products'), api('/api/stats'), api('/api/movements?limit=12')]);
      setProducts(p);
      setStats(s);
      setMovements(m);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products]);
  const reorderList = useMemo(() => products.filter((p) => p.low_stock).sort((a, b) => a.quantity - b.quantity), [products]);

  // filtering client-side keeps typing snappy; the API also supports ?search= for other clients
  const visible = products.filter((p) => {
    const q = search.trim().toLowerCase();
    return (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      && (!category || p.category === category)
      && (!lowOnly || p.low_stock);
  });

  async function saveProduct(body) {
    if (editing.id) {
      // quantity only changes through movements, so edits can't clobber a sale made meanwhile
      const { quantity, ...rest } = body;
      await api(`/api/products/${editing.id}`, { method: 'PUT', body: JSON.stringify(rest) });
    } else {
      await api('/api/products', { method: 'POST', body: JSON.stringify(body) });
    }
    setEditing(null);
    refresh();
  }

  async function recordMovement(body) {
    await api(`/api/products/${moving.id}/movements`, { method: 'POST', body: JSON.stringify(body) });
    setMoving(null);
    refresh();
  }

  async function removeProduct(p) {
    if (!window.confirm(`Delete ${p.name} (${p.sku})? Its movement history goes too.`)) return;
    try {
      await api(`/api/products/${p.id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">◆</span>
          <div>
            <strong>StockPilot</strong>
            <span>Inventory control</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`status-dot ${error ? 'down' : 'up'}`}>{error ? 'API unreachable' : 'API online'}</span>
          <button className="btn primary" onClick={() => setEditing(EMPTY_PRODUCT)}>+ Add product</button>
        </div>
      </header>

      <main className="content">
        <section className="kpis" aria-label="Inventory summary">
          <Kpi label="Products" value={stats ? number.format(stats.total_products) : '—'} hint={`${categories.length} categories`} />
          <Kpi label="Units on hand" value={stats ? number.format(stats.total_units) : '—'} hint="across all SKUs" />
          <Kpi label="Inventory value" value={stats ? money.format(stats.inventory_value) : '—'} hint="at unit price" />
          <Kpi label="Low stock" value={stats ? stats.low_stock : '—'} hint="at or below reorder level" tone={stats?.low_stock ? 'warn' : ''} />
          <Kpi label="Out of stock" value={stats ? stats.out_of_stock : '—'} hint="need restock now" tone={stats?.out_of_stock ? 'danger' : ''} />
        </section>

        {error && (
          <div className="banner" role="alert">
            <span>Couldn't reach the inventory API: {error}</span>
            <button className="btn ghost small" onClick={refresh}>Retry</button>
          </div>
        )}

        <div className="grid">
          <section className="card">
            <div className="card-head">
              <h2>Inventory</h2>
              <div className="filters">
                <input type="search" placeholder="Search name or SKU" value={search}
                  onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
                <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
                <label className="toggle">
                  <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
                </label>
              </div>
            </div>

            {loading ? (
              <div className="empty">Loading inventory…</div>
            ) : visible.length === 0 ? (
              <div className="empty">
                {products.length === 0 ? 'No products yet. Add your first SKU to start tracking stock.' : 'Nothing matches these filters.'}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Product</th><th>Category</th><th>Stock</th><th className="num">Price</th><th className="num">Value</th><th>Status</th><th aria-label="Actions" /></tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => {
                      const state = stockState(p);
                      const fill = Math.min(100, (p.quantity / Math.max(1, p.reorder_level * 3)) * 100);
                      return (
                        <tr key={p.id}>
                          <td><div className="product-cell"><strong>{p.name}</strong><span>{p.sku}{p.supplier && ` · ${p.supplier}`}</span></div></td>
                          <td><span className="chip">{p.category}</span></td>
                          <td>
                            <div className="stock-cell">
                              <span>{number.format(p.quantity)}</span>
                              <div className={`meter ${state.tone}`} title={`Reorder at ${p.reorder_level}`}><i style={{ width: `${fill}%` }} /></div>
                            </div>
                          </td>
                          <td className="num">{money.format(p.unit_price)}</td>
                          <td className="num">{money.format(p.unit_price * p.quantity)}</td>
                          <td><span className={`badge ${state.tone}`}>{state.label}</span></td>
                          <td>
                            <div className="row-actions">
                              <button className="btn small" onClick={() => setMoving(p)}>Stock</button>
                              <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>✎</button>
                              <button className="icon-btn danger" onClick={() => removeProduct(p)} aria-label={`Delete ${p.name}`}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="side">
            <section className="card">
              <div className="card-head"><h2>Reorder list</h2><span className="count">{reorderList.length}</span></div>
              {reorderList.length === 0 ? (
                <div className="empty small">Everything is above its reorder level.</div>
              ) : (
                <ul className="list">
                  {reorderList.slice(0, 6).map((p) => (
                    <li key={p.id}>
                      <div><strong>{p.name}</strong><span>{p.quantity} left · reorder at {p.reorder_level}</span></div>
                      <button className="btn small" onClick={() => setMoving(p)}>Restock</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="card-head"><h2>Recent movements</h2></div>
              {movements.length === 0 ? (
                <div className="empty small">Stock changes will show up here.</div>
              ) : (
                <ul className="feed">
                  {movements.map((m) => (
                    <li key={m.id}>
                      <span className={`delta ${m.change > 0 ? 'in' : 'out'}`}>{m.change > 0 ? `+${m.change}` : m.change}</span>
                      <div>
                        <strong>{m.product_name}</strong>
                        <span>{m.reason.toLowerCase()}{m.note && ` · ${m.note}`}</span>
                      </div>
                      <time dateTime={m.created_at}>{timeAgo(m.created_at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </main>

      {editing && (
        <Modal title={editing.id ? `Edit ${editing.name}` : 'Add product'} onClose={() => setEditing(null)}>
          <ProductForm initial={editing} categories={categories} onSubmit={saveProduct} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {moving && (
        <Modal title="Record stock movement" onClose={() => setMoving(null)}>
          <MovementForm product={moving} onSubmit={recordMovement} onCancel={() => setMoving(null)} />
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
