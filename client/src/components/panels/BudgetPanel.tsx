import { useMemo } from 'react';
import { CATEGORY_LABELS, computeBudget } from '@shared/budget';
import { useEditorStore } from '@/stores/editorStore';
import { euro } from '@/lib/format';
import { EmptyState, NumberField, Section } from '../ui';

export function BudgetPanel() {
  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  const setBudgetLimit = useEditorStore((state) => state.setBudgetLimit);
  const select = useEditorStore((state) => state.select);

  const summary = useMemo(() => computeBudget(design, products), [design, products]);
  const progress = summary.limit && summary.limit > 0 ? Math.min(100, (summary.total / summary.limit) * 100) : 0;

  return (
    <div className="stack">
      <Section title="Budget">
        <div className="stack-sm">
          <div className="row-between">
            <span className="tiny muted">Besteed</span>
            <strong style={{ fontSize: 20 }}>{euro(summary.total)}</strong>
          </div>
          <div className="grid-2">
            <NumberField
              label="Budget"
              value={summary.limit ?? 0}
              min={0}
              max={100000}
              decimals={0}
              suffix="€"
              onCommit={(value) => setBudgetLimit(value === 0 ? null : value)}
            />
            <div className="field">
              <span className="field-label">Over</span>
              <div
                className="input"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: summary.overBudget ? 'var(--red)' : 'var(--green)',
                }}
              >
                {summary.limit === null ? 'Geen budget' : euro(summary.remaining ?? 0)}
              </div>
            </div>
          </div>
          {summary.limit !== null ? (
            <div className={`progress ${summary.overBudget ? 'over' : ''}`}>
              <div style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          <div className="tiny muted">
            {summary.itemCount} artikelen · {summary.missingProductIds.length} onbekende producten
          </div>
          {summary.overBudget ? (
            <div className="notice-banner warn">
              Je ontwerp is {euro(summary.total - (summary.limit ?? 0))} duurder dan je budget.
            </div>
          ) : null}
        </div>
      </Section>

      {summary.lines.length === 0 ? (
        <EmptyState title="Nog geen artikelen">
          Plaats meubels uit de catalogus; de bestellijst en het totaal worden automatisch bijgewerkt.
        </EmptyState>
      ) : (
        <>
          <Section title="Per categorie">
            <div className="stack-sm">
              {summary.byCategory.map((entry) => (
                <div key={entry.category} className="stack-sm">
                  <div className="row-between tiny">
                    <span>{CATEGORY_LABELS[entry.category]}</span>
                    <span className="muted">
                      {entry.quantity}× · {euro(entry.subtotal)}
                    </span>
                  </div>
                  <div className="progress">
                    <div style={{ width: `${(entry.subtotal / summary.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Bestellijst">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Aantal</th>
                  <th className="num">Prijs</th>
                </tr>
              </thead>
              <tbody>
                {summary.lines.map((line) => (
                  <tr
                    key={line.productId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const placement = design.placements.find((p) => p.productId === line.productId);
                      if (placement) select(placement.id);
                    }}
                  >
                    <td>
                      <div>{line.label}</div>
                      <div className="tiny muted">{line.retailerName}</div>
                    </td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{euro(line.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {summary.lines.every((line) => line.retailerName.includes('Demo')) ? (
              <p className="hint" style={{ marginTop: 10 }}>
                Prijzen komen uit de demo-catalogus en zijn indicatief, niet uit een live winkelprijs.
              </p>
            ) : null}
          </Section>
        </>
      )}
    </div>
  );
}
