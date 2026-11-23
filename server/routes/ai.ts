import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../auth';
import { HttpError } from '../http';
import { toProduct } from '../mappers';
import { aiSuggestSchema } from '../../shared/validation';
import { planLayouts } from '../../shared/planner';
import type { DesignDoc } from '../../shared/types';

export const aiRouter = Router();

aiRouter.use(requireAuth);

/**
 * Deterministic layout proposals. The endpoint never writes to a project: the
 * client receives proposals and applies one only after the user approves it.
 * Swapping this engine for an LLM later keeps the same contract.
 */
aiRouter.post('/suggest', async (req, res) => {
  const input = aiSuggestSchema.parse(req.body);
  const design = input.design as DesignDoc;

  const products = await prisma.product.findMany({
    where: {
      ...(input.brief.retailerIds.length > 0 ? { retailerId: { in: input.brief.retailerIds } } : {}),
      ...(input.productIds && input.productIds.length > 0 ? { id: { in: input.productIds } } : {}),
    },
    take: 600,
  });

  if (products.length === 0) {
    throw new HttpError(422, 'Geen producten beschikbaar voor deze selectie.');
  }

  const proposals = planLayouts({
    room: design.room,
    products: products.map(toProduct),
    brief: input.brief,
  });

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    engine: 'roomcraft-rule-based-v1',
    generatedAt: new Date().toISOString(),
    proposals,
  });
});
