import { useState } from 'react';
import type { DesignBrief, LayoutProposal, StyleId } from '@shared/types';
import { api, ApiError } from '@/api';
import { useEditorStore } from '@/stores/editorStore';
import { euro } from '@/lib/format';
import { Section } from '../ui';

const ROOM_TYPES: Array<{ value: DesignBrief['roomType']; label: string }> = [
  { value: 'living', label: 'Woonkamer' },
  { value: 'bedroom', label: 'Slaapkamer' },
  { value: 'dining', label: 'Eetkamer' },
  { value: 'office', label: 'Werkkamer' },
  { value: 'studio', label: 'Studio' },
];

const STYLES: Array<{ value: StyleId; label: string }> = [
  { value: 'modern', label: 'Modern' },
  { value: 'scandinavian', label: 'Scandinavisch' },
  { value: 'industrial', label: 'Industry' },
  { value: 'classic', label: 'Klassiek' },
  { value: 'minimal', label: 'Minimalistisch' },
  { value: 'bohemian', label: 'Bohemian' },
];

export function AiPanel() {
  const design = useEditorStore((state) => state.design);
  const applyProposal = useEditorStore((state) => state.applyProposal);
  const previewProposal = useEditorStore((state) => state.previewProposal);
  const pendingProposal = useEditorStore((state) => state.pendingProposal);
  const notify = useEditorStore((state) => state.notify);

  const [brief, setBrief] = useState<DesignBrief>({
    roomType: 'living',
    style: 'scandinavian',
    budget: design.budget.limit,
    notes: '',
    retailerIds: [],
  });
  const [proposals, setProposals] = useState<LayoutProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.suggest({ design, brief });
      setProposals(result.proposals);
      if (result.proposals.length === 0) {
        setError('Geen voorstel gevonden. Pas de wensen of het budget aan.');
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Voorstellen ophalen is mislukt.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack">
      <div className="notice-banner info">
        <span>✧</span>
        <div>
          <strong>AI-ontwerper (regelgebaseerd).</strong> RoomCraft berekent zelf een indeling op basis
          van je kamer, stijl en budget. Niets wordt automatisch toegepast: je beoordeelt elk voorstel en
          keurt het goed of verwerpt het.
        </div>
      </div>

      <Section title="Ontwerpvraag">
        <div className="stack-sm">
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Ruimte</span>
              <select
                className="select"
                value={brief.roomType}
                onChange={(event) =>
                  setBrief((current) => ({ ...current, roomType: event.target.value as DesignBrief['roomType'] }))
                }
              >
                {ROOM_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Stijl</span>
              <select
                className="select"
                value={brief.style}
                onChange={(event) =>
                  setBrief((current) => ({ ...current, style: event.target.value as StyleId }))
                }
              >
                {STYLES.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field-label">Budget (€)</span>
            <input
              className="input"
              inputMode="decimal"
              value={brief.budget ?? ''}
              placeholder="Geen limiet"
              onChange={(event) => {
                const parsed = Number(event.target.value.replace(',', '.'));
                setBrief((current) => ({
                  ...current,
                  budget: Number.isFinite(parsed) && event.target.value !== '' ? parsed : null,
                }));
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Wensen</span>
            <textarea
              className="textarea"
              placeholder="Bijv. extra werkplek bij het raam, ruimte voor bezoek…"
              value={brief.notes}
              onChange={(event) => setBrief((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
          <button type="button" className="btn btn-primary btn-block" onClick={() => void generate()} disabled={loading}>
            {loading ? <span className="spinner" /> : '✧'}
            {loading ? 'Indeling berekenen…' : 'Voorstellen genereren'}
          </button>
          {error ? <div className="form-error">{error}</div> : null}
        </div>
      </Section>

      {pendingProposal ? (
        <div className="notice-banner warn">
          <div>
            <strong>Voorstel in beoordeling: {pendingProposal.title}</strong>
            <div className="tiny" style={{ marginTop: 3 }}>
              Het voorstel staat als groene laag in de plattegrond. Pas het toe of verwerp het.
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => applyProposal(pendingProposal)}
              >
                Goedkeuren & toepassen
              </button>
              <button type="button" className="btn btn-sm" onClick={() => previewProposal(null)}>
                Verwerpen
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {proposals.length > 0 ? (
        <Section title={`Voorstellen (${proposals.length})`}>
          <div className="stack">
            {proposals.map((proposal) => {
              const errors = proposal.fitIssues.filter((issue) => issue.severity === 'error').length;
              return (
                <article className="proposal" key={proposal.id}>
                  <div className="proposal-head">
                    <div className="row-between">
                      <strong>{proposal.title}</strong>
                      <span className="badge demo">{euro(proposal.estimatedCost)}</span>
                    </div>
                    <p className="tiny muted" style={{ marginTop: 4 }}>
                      {proposal.summary}
                    </p>
                  </div>
                  <div className="proposal-body">
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                      <span className="badge">{proposal.placements.length} meubels</span>
                      <span className={`badge ${errors > 0 ? 'err' : 'ok'}`}>
                        {errors > 0 ? `${errors} blokkade(s)` : 'Past zonder blokkades'}
                      </span>
                    </div>
                    <ul>
                      {proposal.rationale.slice(0, 5).map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                    <div className="row">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          previewProposal(proposal);
                          notify('info', 'Voorstel wordt als groene laag getoond.');
                        }}
                      >
                        Bekijken in 2D
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          applyProposal(proposal);
                          setProposals((current) => current.filter((entry) => entry.id !== proposal.id));
                        }}
                      >
                        Toepassen
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Section>
      ) : null}

      {!loading && proposals.length === 0 && !error ? (
        <p className="hint">
          De engine plaatst ankerstukken (bank, bed, tafel of bureau) tegen de meest geschikte wand en
          vult daarna bijzettafels, stoelen, kleed, lamp en plant in. Elk voorstel wordt direct tegen
          botsingen, deuren en je budget gecontroleerd.
        </p>
      ) : null}
    </div>
  );
}
