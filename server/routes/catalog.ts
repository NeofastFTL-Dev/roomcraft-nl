import { Router } from 'express';
import { prisma } from '../db';
import { toProduct } from '../mappers';
import { catalogQuerySchema } from '../../shared/validation';
import { retailerAdapters, retailerStatuses, RetailerNotConfiguredError } from '../retailers';
import { requireAuth } from '../auth';
import { HttpError } from '../http';

export const catalogRouter = Router();

catalogRouter.get('/', async (req, res) => {
  const query = catalogQuerySchema.parse(req.query);
  const products = await prisma.product.findMany({
    where: {
      ...(query.category ? { category: query.category } : {}),
      ...(query.retailerId ? { retailerId: query.retailerId } : {}),
      ...(query.style ? { styles: { has: query.style } } : {}),
      ...(query.maxPrice !== undefined ? { priceCents: { lte: Math.round(query.maxPrice * 100) } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { brand: { contains: query.search, mode: 'insensitive' as const } },
              { sku: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: 'asc' }, { priceCents: 'asc' }],
    take: query.limit ?? 120,
  });
  res.json({ products: products.map(toProduct) });
});

catalogRouter.get('/facets', async (_req, res) => {
  const rows = await prisma.product.groupBy({ by: ['category'], _count: { _all: true } });
  const retailers = await prisma.product.groupBy({ by: ['retailerId'], _count: { _all: true } });
  const demoCount = await prisma.product.count({ where: { dataSource: 'demo' } });
  res.json({
    categories: rows.map((row) => ({ category: row.category, count: row._count._all })),
    retailers: retailerStatuses(demoCount).map((status) => ({
      ...status,
      productCount:
        status.id === 'demo-showroom'
          ? demoCount
          : (retailers.find((row) => row.retailerId === status.id)?._count._all ?? 0),
    })),
    retailersAvailable: retailerAdapters.length,
  });
});

catalogRouter.get('/:id', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) throw new HttpError(404, 'Product niet gevonden.');
  res.json({ product: toProduct(product) });
});

export const retailersRouter = Router();

retailersRouter.get('/', async (_req, res) => {
  const demoCount = await prisma.product.count({ where: { dataSource: 'demo' } });
  res.json({ retailers: retailerStatuses(demoCount) });
});

/**
 * Pull a configured retailer feed into the product table. This is real code,
 * but it has never been exercised against a live partner feed because no
 * agreement/credentials exist in this environment — the UI states that.
 */
retailersRouter.post('/:id/sync', requireAuth, async (req, res) => {
  const adapter = retailerAdapters.find((entry) => entry.id === req.params.id);
  if (!adapter) throw new HttpError(404, 'Onbekende retailer.');
  try {
    const products = await adapter.fetchProducts();
    for (const product of products) {
      const data = {
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        retailerId: product.retailerId,
        retailerName: product.retailerName,
        category: product.category,
        priceCents: Math.round(product.price * 100),
        currency: 'EUR',
        widthM: product.dimensions.width,
        depthM: product.dimensions.depth,
        heightM: product.dimensions.height,
        color: product.color,
        materials: product.materials,
        styles: product.styles,
        modelUrl: product.modelUrl,
        imageUrl: product.imageUrl,
        dataSource: 'retailer',
        externalUrl: product.externalUrl,
        inStock: product.inStock,
        deliveryWeeks: product.deliveryWeeks,
        allowsOverlap: product.allowsOverlap,
        wallMounted: product.wallMounted,
        tags: product.tags,
      };
      await prisma.product.upsert({ where: { id: product.id }, create: { id: product.id, ...data }, update: data });
    }
    res.json({ imported: products.length, retailer: adapter.status() });
  } catch (error) {
    if (error instanceof RetailerNotConfiguredError) {
      res.status(409).json({
        error: error.message,
        status: adapter.status(),
      });
      return;
    }
    throw error;
  }
});
