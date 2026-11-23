import type { BudgetSummary, DesignDoc, Product, ProductCategory } from './types';

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  seating: 'Zitmeubelen',
  tables: 'Tafels',
  storage: 'Opbergmeubelen',
  beds: 'Bedden',
  lighting: 'Verlichting',
  rugs: 'Vloerkleden',
  decor: 'Decoratie',
  plants: 'Planten',
};

export function indexProducts(products: Product[]): Map<string, Product> {
  return new Map(products.map((product) => [product.id, product]));
}

export function computeBudget(
  design: Pick<DesignDoc, 'placements' | 'budget'>,
  products: Product[] | Map<string, Product>,
): BudgetSummary {
  const map = products instanceof Map ? products : indexProducts(products);
  const totals = new Map<string, BudgetSummary['lines'][number]>();
  const categoryTotals = new Map<ProductCategory, { subtotal: number; quantity: number }>();
  const missingProductIds: string[] = [];

  for (const placement of design.placements) {
    const product = map.get(placement.productId);
    if (!product) {
      if (!missingProductIds.includes(placement.productId)) missingProductIds.push(placement.productId);
      continue;
    }
    const existing = totals.get(product.id);
    if (existing) {
      existing.quantity += 1;
      existing.subtotal = roundCurrency(existing.quantity * existing.unitPrice);
    } else {
      totals.set(product.id, {
        productId: product.id,
        label: product.name,
        category: product.category,
        retailerName: product.retailerName,
        unitPrice: product.price,
        quantity: 1,
        subtotal: product.price,
      });
    }
    const category = categoryTotals.get(product.category) ?? { subtotal: 0, quantity: 0 };
    category.quantity += 1;
    category.subtotal = roundCurrency(category.subtotal + product.price);
    categoryTotals.set(product.category, category);
  }

  const lines = [...totals.values()].sort((a, b) => b.subtotal - a.subtotal || a.label.localeCompare(b.label));
  const total = roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const itemCount = design.placements.length;
  const limit = design.budget.limit;
  const remaining = limit === null ? null : roundCurrency(limit - total);

  return {
    currency: 'EUR',
    limit,
    total,
    remaining,
    overBudget: limit !== null && total > limit + 0.001,
    itemCount,
    lines,
    byCategory: [...categoryTotals.entries()]
      .map(([category, value]) => ({ category, ...value }))
      .sort((a, b) => b.subtotal - a.subtotal),
    missingProductIds,
  };
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatEuro(value: number, currency: 'EUR' = 'EUR'): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function budgetToCsv(summary: BudgetSummary): string {
  const rows: string[][] = [
    ['Product', 'Categorie', 'Winkel', 'Prijs per stuk', 'Aantal', 'Subtotaal'],
    ...summary.lines.map((line) => [
      line.label,
      CATEGORY_LABELS[line.category],
      line.retailerName,
      line.unitPrice.toFixed(2).replace('.', ','),
      String(line.quantity),
      line.subtotal.toFixed(2).replace('.', ','),
    ]),
    [],
    ['Totaal', '', '', '', String(summary.itemCount), summary.total.toFixed(2).replace('.', ',')],
    ['Budget', '', '', '', '', summary.limit === null ? '' : summary.limit.toFixed(2).replace('.', ',')],
  ];
  return rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}

function csvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
