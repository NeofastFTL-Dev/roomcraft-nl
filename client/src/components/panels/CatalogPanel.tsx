import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_LABELS } from '@shared/budget';
import type { RetailerStatus } from '@shared/types';
import { api, ApiError } from '@/api';
import { useEditorStore } from '@/stores/editorStore';
import { euro, meters } from '@/lib/format';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>;

export function CatalogPanel() {
  const products = useEditorStore((state) => state.products);
  const addProduct = useEditorStore((state) => state.addProduct);
  const notify = useEditorStore((state) => state.notify);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [retailer, setRetailer] = useState<string>('all');
  const [retailers, setRetailers] = useState<RetailerStatus[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    api
      .retailers()
      .then((result) => setRetailers(result.retailers))
      .catch(() => setRetailers([]));
  }, []);

  /** Products plus every configured retailer connector, so the integration state
   *  (including "not connected") is visible in the catalog filter. */
  const retailerOptions = useMemo(() => {
    const options = new Map<string, { id: string; name: string; status?: RetailerStatus['status'] }>();
    for (const product of products) {
      options.set(product.retailerId, { id: product.retailerId, name: product.retailerName });
    }
    for (const retailer of retailers) {
      const existing = options.get(retailer.id);
      options.set(retailer.id, {
        id: retailer.id,
        name: retailer.name,
        status: retailer.status,
      });
      if (!existing && retailer.id !== 'demo-showroom') {
        options.set(retailer.id, { id: retailer.id, name: retailer.name, status: retailer.status });
      }
    }
    return [...options.values()];
  }, [products, retailers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== 'all' && product.category !== category) return false;
      if (retailer !== 'all' && product.retailerId !== retailer) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        product.brand.toLowerCase().includes(term) ||
        product.tags.some((tag) => tag.includes(term))
      );
    });
  }, [products, search, category, retailer]);

  const selectedRetailer = retailers.find((entry) => entry.id === retailer);
  const demoOnly = products.every((product) => product.dataSource === 'demo');

  const sync = async (id: string) => {
    setSyncing(id);
    try {
      const result = await api.syncRetailer(id);
      notify('success', `${result.imported} producten geïmporteerd uit ${result.retailer.name}.`);
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Synchronisatie mislukt.');
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="stack">
      {demoOnly ? (
        <div className="notice-banner warn">
          <span>ⓘ</span>
          <div>
            <strong>Demo-catalogus.</strong> Deze artikelen zijn door RoomCraft gemaakt met realistische
            afmetingen en prijzen. Het is <em>geen</em> aanbod van een echte Nederlandse winkel.
          </div>
        </div>
      ) : null}

      <div className="stack-sm">
        <input
          className="input"
          placeholder="Zoek op naam, merk of tag…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Producten zoeken"
        />
        <select
          className="select"
          value={retailer}
          onChange={(event) => setRetailer(event.target.value)}
          aria-label="Winkel"
        >
          <option value="all">Alle winkels ({retailerOptions.length})</option>
          {retailerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.status === 'not_configured' ? ' — niet gekoppeld' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="chip-row">
        <button
          type="button"
          className={`chip ${category === 'all' ? 'active' : ''}`}
          onClick={() => setCategory('all')}
        >
          Alles ({products.length})
        </button>
        {CATEGORIES.map((key) => {
          const count = products.filter((product) => product.category === key).length;
          if (count === 0) return null;
          return (
            <button
              key={key}
              type="button"
              className={`chip ${category === key ? 'active' : ''}`}
              onClick={() => setCategory(key)}
            >
              {CATEGORY_LABELS[key]} ({count})
            </button>
          );
        })}
      </div>

      {selectedRetailer && selectedRetailer.status !== 'configured' ? (
        <div className="notice-banner">
          <div>
            <strong>{selectedRetailer.name} is niet gekoppeld.</strong>
            <div className="tiny" style={{ marginTop: 4 }}>
              {selectedRetailer.message}
            </div>
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: 8 }}
              disabled={syncing === selectedRetailer.id}
              onClick={() => void sync(selectedRetailer.id)}
            >
              {syncing === selectedRetailer.id ? 'Bezig…' : 'Feed synchroniseren'}
            </button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <strong>Geen producten gevonden</strong>
          Pas je zoekopdracht of categorie aan.
        </div>
      ) : (
        <div className="product-grid" style={{ display: 'grid', gap: 8 }}>
          {filtered.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-thumb">
                <div
                  className="product-shape"
                  style={{
                    width: `${Math.min(72, 26 + product.dimensions.width * 16)}%`,
                    height: `${Math.min(58, 18 + product.dimensions.height * 22)}%`,
                    background: `linear-gradient(160deg, ${product.color}, ${product.color}bb)`,
                  }}
                />
                <span className="badge demo" style={{ position: 'absolute', top: 6, left: 6 }}>
                  {product.dataSource === 'demo' ? 'demo' : product.retailerName}
                </span>
              </div>
              <div>
                <div className="product-name">{product.name}</div>
                <div className="product-meta">{product.brand}</div>
              </div>
              <div className="row-between">
                <span className="product-price">{euro(product.price)}</span>
                <span className="product-meta">
                  {meters(product.dimensions.width)} × {meters(product.dimensions.depth)}
                </span>
              </div>
              <div className="row-between">
                <span className="product-meta">
                  h {meters(product.dimensions.height)} · {product.deliveryWeeks} wk
                </span>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => addProduct(product)}>
                  Plaatsen
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
