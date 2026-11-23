import type { Product, ProductCategory, RetailerStatus } from '../shared/types';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  brand: string;
  retailerId: string;
  retailerName: string;
  category: string;
  priceCents: number;
  currency: string;
  widthM: number;
  depthM: number;
  heightM: number;
  color: string;
  materials: string[];
  styles: string[];
  modelUrl: string | null;
  imageUrl: string | null;
  dataSource: string;
  externalUrl: string | null;
  inStock: boolean;
  deliveryWeeks: number;
  allowsOverlap: boolean;
  wallMounted: boolean;
  tags: string[];
  updatedAt: Date;
}

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    retailerId: row.retailerId,
    retailerName: row.retailerName,
    category: row.category as ProductCategory,
    price: row.priceCents / 100,
    currency: 'EUR',
    dimensions: { width: row.widthM, depth: row.depthM, height: row.heightM },
    color: row.color,
    materials: row.materials,
    styles: row.styles,
    modelUrl: row.modelUrl,
    imageUrl: row.imageUrl,
    dataSource: row.dataSource === 'retailer' ? 'retailer' : 'demo',
    externalUrl: row.externalUrl,
    inStock: row.inStock,
    deliveryWeeks: row.deliveryWeeks,
    allowsOverlap: row.allowsOverlap,
    wallMounted: row.wallMounted,
    tags: row.tags,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface RetailerStatusSource {
  id: string;
  name: string;
  country: string;
  docsUrl: string | null;
  feed: RetailerStatus['feed'];
  isConfigured: boolean;
  message: string;
  lastSyncAt: string | null;
  productCount: number;
}

export function toRetailerStatus(source: RetailerStatusSource): RetailerStatus {
  return {
    id: source.id,
    name: source.name,
    country: source.country,
    status: source.isConfigured ? 'configured' : 'not_configured',
    feed: source.feed,
    message: source.message,
    docsUrl: source.docsUrl,
    lastSyncAt: source.lastSyncAt,
    productCount: source.productCount,
  };
}
