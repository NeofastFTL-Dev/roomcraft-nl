import {
  RETAILER_CATALOG_NOTE,
  RETAILER_DEFINITIONS,
  type RetailerDefinition,
} from '../shared/retailers';
import type { Product, RetailerStatus } from '../shared/types';

/**
 * Retailer integration interface.
 *
 * RoomCraft deliberately ships no scraped retailer data. A connector switches
 * to `configured` only when an operator supplies a product-feed URL (and key)
 * from a signed partner/affiliate agreement. Until then it reports
 * `not_configured` and the UI says so explicitly.
 *
 * Feed contract (documented in BUILD_PLAN.md § Retailer integration):
 *   GET <feedUrl>  →  { items: RetailerFeedItem[] }
 *   Authorization: Bearer <apiKey>
 */
export interface RetailerFeedItem {
  id: string;
  sku: string;
  name: string;
  brand?: string;
  category: string;
  price: number;
  currency?: string;
  width: number;
  depth: number;
  height: number;
  color?: string;
  materials?: string[];
  styles?: string[];
  modelUrl?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  inStock?: boolean;
  deliveryWeeks?: number;
  allowsOverlap?: boolean;
  wallMounted?: boolean;
  tags?: string[];
}

export class RetailerNotConfiguredError extends Error {
  constructor(public readonly retailerId: string) {
    super(
      `Retailer ${retailerId} heeft geen geconfigureerde productfeed. ` +
        'RoomCraft toont daarom geen live aanbod van deze winkel.',
    );
  }
}

export interface RetailerAdapter {
  id: string;
  name: string;
  country: string;
  docsUrl: string | null;
  feed: RetailerStatus['feed'];
  status(): RetailerStatus;
  fetchProducts(): Promise<Product[]>;
}

function createAdapter(config: RetailerDefinition): RetailerAdapter {
  const feedUrl = process.env[config.feedUrlEnv]?.trim() ?? '';
  const apiKey = process.env[config.apiKeyEnv]?.trim() ?? '';
  const isConfigured = Boolean(feedUrl);

  return {
    id: config.id,
    name: config.name,
    country: 'NL',
    docsUrl: config.docsUrl,
    feed: config.feed,
    status() {
      return {
        id: config.id,
        name: config.name,
        country: 'NL',
        status: isConfigured ? 'configured' : 'not_configured',
        feed: config.feed,
        message: isConfigured
          ? 'Feed-URL gevonden. Synchronisatie is beschikbaar; controleer de leveringsvoorwaarden van de retailer.'
          : `${RETAILER_CATALOG_NOTE} Stel ${config.feedUrlEnv} in om te koppelen.`,
        docsUrl: config.docsUrl,
        lastSyncAt: null,
        productCount: 0,
      };
    },
    async fetchProducts() {
      if (!feedUrl) throw new RetailerNotConfiguredError(config.id);
      const response = await fetch(feedUrl, {
        headers: {
          accept: 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(`Feed ${config.id} antwoordde met status ${response.status}.`);
      }
      const payload = (await response.json()) as { items?: RetailerFeedItem[] };
      if (!Array.isArray(payload.items)) {
        throw new Error(`Feed ${config.id} heeft geen "items"-array.`);
      }
      return payload.items.map((item) => mapFeedItem(config, item));
    },
  };
}

function mapFeedItem(config: RetailerDefinition, item: RetailerFeedItem): Product {
  return {
    id: `${config.id}:${item.id}`,
    sku: item.sku,
    name: item.name,
    brand: item.brand ?? config.name,
    retailerId: config.id,
    retailerName: config.name,
    category: item.category as Product['category'],
    price: item.price,
    currency: 'EUR',
    dimensions: { width: item.width, depth: item.depth, height: item.height },
    color: item.color ?? '#b0aca4',
    materials: item.materials ?? [],
    styles: item.styles ?? [],
    modelUrl: item.modelUrl ?? null,
    imageUrl: item.imageUrl ?? null,
    dataSource: 'retailer',
    externalUrl: item.url ?? null,
    inStock: item.inStock ?? true,
    deliveryWeeks: item.deliveryWeeks ?? 3,
    allowsOverlap: item.allowsOverlap ?? false,
    wallMounted: item.wallMounted ?? false,
    tags: item.tags ?? [],
    updatedAt: new Date().toISOString(),
  };
}

/** One adapter per Dutch shop in the shared list; see `shared/retailers.ts`. */
export const retailerAdapters: RetailerAdapter[] = RETAILER_DEFINITIONS.map(createAdapter);

export const DEMO_RETAILER: RetailerStatus = {
  id: 'demo-showroom',
  name: 'RoomCraft Demo Showroom',
  country: 'NL',
  status: 'configured',
  feed: 'none',
  message:
    'Synthetische demo-artikelen met realistische afmetingen. Geen aanbod van een echte winkel en geen live prijzen.',
  docsUrl: null,
  lastSyncAt: null,
  productCount: 0,
};

export function retailerStatuses(demoCount: number): RetailerStatus[] {
  return [{ ...DEMO_RETAILER, productCount: demoCount }, ...retailerAdapters.map((a) => a.status())];
}
