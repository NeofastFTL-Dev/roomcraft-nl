import { useMemo } from 'react';
import { analyzeFit } from '@shared/fit';
import { useEditorStore } from '@/stores/editorStore';
import { EmptyState, Section } from '../ui';

export function FitPanel() {
  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  const select = useEditorStore((state) => state.select);
  const selectWall = useEditorStore((state) => state.selectWall);

  const issues = useMemo(() => analyzeFit(design, { products }), [design, products]);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return (
    <div className="stack">
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value" style={{ color: errors.length ? 'var(--red)' : 'var(--green)' }}>
            {errors.length}
          </div>
          <div className="stat-label">Blokkades</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: warnings.length ? 'var(--accent)' : undefined }}>
            {warnings.length}
          </div>
          <div className="stat-label">Waarschuwingen</div>
        </div>
        <div className="stat">
          <div className="stat-value">{design.placements.length}</div>
          <div className="stat-label">Meubels</div>
        </div>
      </div>

      {issues.length === 0 ? (
        <EmptyState title="Alles past">
          Geen overlappende meubels, geen geblokkeerde deuren en alles staat binnen de kamer.
        </EmptyState>
      ) : (
        <>
          {errors.length > 0 ? (
            <Section title={`Blokkades (${errors.length})`}>
              <div className="stack-sm">
                {errors.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    className="issue-row error"
                    onClick={() => {
                      if (issue.placementIds[0]) select(issue.placementIds[0]);
                      else if (issue.wallId) selectWall(issue.wallId);
                    }}
                  >
                    <span className="issue-icon">⛔</span>
                    <span>{issue.message}</span>
                  </button>
                ))}
              </div>
            </Section>
          ) : null}

          {warnings.length > 0 ? (
            <Section title={`Waarschuwingen (${warnings.length})`}>
              <div className="stack-sm">
                {warnings.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    className="issue-row warning"
                    onClick={() => {
                      if (issue.placementIds[0]) select(issue.placementIds[0]);
                      else if (issue.wallId) selectWall(issue.wallId);
                    }}
                  >
                    <span className="issue-icon">⚠</span>
                    <span>{issue.message}</span>
                  </button>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}

      <Section title="Zo controleert RoomCraft">
        <ul className="hint" style={{ paddingLeft: 16, display: 'grid', gap: 4 }}>
          <li>Meubels binnen de binnenmuren en buiten de muurdikte</li>
          <li>Onderlinge overlap (vloerkleden mogen onder meubels liggen)</li>
          <li>Vrije draaicirkel van elke deur (breedte = bladdiepte)</li>
          <li>Looproute vanaf de deur naar het midden van de kamer</li>
          <li>Raamobstructie door hoge kasten en wandmeubels</li>
          <li>Plafondhoogte tegenover de hoogte van het meubel</li>
        </ul>
      </Section>
    </div>
  );
}
