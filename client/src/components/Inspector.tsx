import { useMemo, useState } from 'react';
import { analyzeFit } from '@shared/fit';
import { computeBudget } from '@shared/budget';
import { useEditorStore } from '@/stores/editorStore';
import { CatalogPanel } from './panels/CatalogPanel';
import { RoomPanel } from './panels/RoomPanel';
import { ItemPanel } from './panels/ItemPanel';
import { DecorPanel } from './panels/DecorPanel';
import { FitPanel } from './panels/FitPanel';
import { BudgetPanel } from './panels/BudgetPanel';
import { AiPanel } from './panels/AiPanel';
import { ProjectPanel } from './panels/ProjectPanel';

type TabKey = 'catalog' | 'room' | 'item' | 'decor' | 'fit' | 'budget' | 'ai' | 'project';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'catalog', label: 'Catalogus', icon: '▦' },
  { key: 'room', label: 'Kamer', icon: '⌂' },
  { key: 'item', label: 'Meubel', icon: '◱' },
  { key: 'decor', label: 'Decoratie', icon: '◐' },
  { key: 'fit', label: 'Pasvorm', icon: '✓' },
  { key: 'budget', label: 'Budget', icon: '€' },
  { key: 'ai', label: 'AI', icon: '✧' },
  { key: 'project', label: 'Project', icon: '⚙' },
];

export function Inspector() {
  const [tab, setTab] = useState<TabKey>('catalog');
  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  const selection = useEditorStore((state) => state.selection);

  const issues = useMemo(() => analyzeFit(design, { products }), [design, products]);
  const budget = useMemo(() => computeBudget(design, products), [design, products]);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return (
    <aside className="inspector" aria-label="Eigenschappen">
      <div className="tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            className={`tab ${tab === entry.key ? 'active' : ''}`}
            onClick={() => setTab(entry.key)}
          >
            <span aria-hidden>{entry.icon}</span>
            {entry.label}
            {entry.key === 'fit' && errorCount + warningCount > 0 ? (
              <span className={`tab-count ${errorCount > 0 ? 'error' : ''}`}>
                {errorCount > 0 ? errorCount : warningCount}
              </span>
            ) : null}
            {entry.key === 'budget' && budget.overBudget ? <span className="tab-count error">!</span> : null}
            {entry.key === 'item' && selection.length > 0 ? (
              <span className="tab-count">{selection.length}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {tab === 'catalog' ? <CatalogPanel /> : null}
        {tab === 'room' ? <RoomPanel /> : null}
        {tab === 'item' ? <ItemPanel /> : null}
        {tab === 'decor' ? <DecorPanel /> : null}
        {tab === 'fit' ? <FitPanel /> : null}
        {tab === 'budget' ? <BudgetPanel /> : null}
        {tab === 'ai' ? <AiPanel /> : null}
        {tab === 'project' ? <ProjectPanel /> : null}
      </div>
    </aside>
  );
}
