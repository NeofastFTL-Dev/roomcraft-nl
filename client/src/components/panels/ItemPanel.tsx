import { useMemo } from 'react';
import { MATERIAL_PRESETS, COLOR_SWATCHES } from '@shared/catalog';
import { analyzeFit } from '@shared/fit';
import { useEditorStore } from '@/stores/editorStore';
import { euro, meters } from '@/lib/format';
import { EmptyState, NumberField, Section, Toggle } from '../ui';

export function ItemPanel() {
  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  const selection = useEditorStore((state) => state.selection);
  const updatePlacement = useEditorStore((state) => state.updatePlacement);
  const removeSelected = useEditorStore((state) => state.removeSelected);
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected);
  const rotateSelected = useEditorStore((state) => state.rotateSelected);
  const alignToNearestWall = useEditorStore((state) => state.alignToNearestWall);

  const placement = selection.length === 1 ? design.placements.find((p) => p.id === selection[0]) : null;
  const product = placement ? products.find((p) => p.id === placement.productId) : undefined;

  const issues = useMemo(
    () => analyzeFit(design, { products }).filter((issue) => issue.placementIds.some((id) => selection.includes(id))),
    [design, products, selection],
  );

  if (selection.length === 0) {
    return (
      <EmptyState title="Niets geselecteerd">
        Klik een meubel aan in de plattegrond of 3D-weergave om afmetingen, kleur en materiaal aan te
        passen.
      </EmptyState>
    );
  }

  if (!placement) {
    return (
      <div className="stack">
        <Section title={`${selection.length} meubels geselecteerd`}>
          <div className="stack-sm">
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => rotateSelected(-90)}>
                ⟲ 90°
              </button>
              <button type="button" className="btn btn-sm" onClick={() => rotateSelected(90)}>
                ⟳ 90°
              </button>
              <button type="button" className="btn btn-sm" onClick={duplicateSelected}>
                Dupliceren
              </button>
            </div>
            <button type="button" className="btn btn-sm btn-danger btn-block" onClick={removeSelected}>
              Selectie verwijderen
            </button>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="stack">
      <Section title="Meubel">
        <div className="stack-sm">
          <div className="row-between">
            <div>
              <div style={{ fontWeight: 600 }}>{placement.label}</div>
              <div className="tiny muted">{product?.brand ?? 'Onbekend product'}</div>
            </div>
            {product ? <span className="badge demo">{euro(product.price)}</span> : null}
          </div>
          <div className="tiny muted">
            {meters(placement.dimensions.width)} × {meters(placement.dimensions.depth)} ×{' '}
            {meters(placement.dimensions.height)} (b × d × h)
          </div>
          <p className="hint">
            Afmetingen komen uit de productdata en zijn niet aanpasbaar, zodat de plattegrond op ware
            grootte blijft.
          </p>
        </div>
      </Section>

      <Section title="Positie">
        <div className="grid-2">
          <NumberField
            label="X"
            value={placement.position.x}
            min={-20}
            max={60}
            suffix="m"
            onCommit={(value) =>
              updatePlacement(placement.id, { position: { ...placement.position, x: value } })
            }
          />
          <NumberField
            label="Z"
            value={placement.position.z}
            min={-20}
            max={60}
            suffix="m"
            onCommit={(value) =>
              updatePlacement(placement.id, { position: { ...placement.position, z: value } })
            }
          />
          <NumberField
            label="Rotatie"
            value={placement.rotation}
            min={0}
            max={359}
            step={15}
            decimals={0}
            suffix="°"
            onCommit={(value) => updatePlacement(placement.id, { rotation: value })}
          />
          {product?.wallMounted ? (
            <NumberField
              label="Hoogte"
              value={placement.elevation}
              min={0}
              max={design.room.ceilingHeight - placement.dimensions.height}
              suffix="m"
              onCommit={(value) => updatePlacement(placement.id, { elevation: value })}
            />
          ) : null}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => alignToNearestWall(placement.id)}>
            Tegen dichtstbijzijnde muur
          </button>
          <button type="button" className="btn btn-sm" onClick={() => rotateSelected(90)}>
            +90°
          </button>
        </div>
      </Section>

      <Section title="Kleur & materiaal">
        <div className="stack-sm">
          <div className="swatches">
            <button
              type="button"
              className={`swatch ${placement.color === null ? 'active' : ''}`}
              title="Standaardkleur"
              style={{
                background: `linear-gradient(135deg, ${product?.color ?? '#8d8880'} 50%, #ffffff22 50%)`,
              }}
              onClick={() => updatePlacement(placement.id, { color: null })}
            />
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                className={`swatch ${placement.color === swatch.hex ? 'active' : ''}`}
                title={swatch.name}
                style={{ background: swatch.hex }}
                onClick={() => updatePlacement(placement.id, { color: swatch.hex })}
              />
            ))}
          </div>
          <label className="field">
            <span className="field-label">Materiaal</span>
            <select
              className="select"
              value={placement.material ?? ''}
              onChange={(event) =>
                updatePlacement(placement.id, { material: event.target.value || null })
              }
            >
              <option value="">Standaard</option>
              {Object.entries(MATERIAL_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section title="Beheer">
        <div className="stack-sm">
          <Toggle
            label="Vergrendelen"
            hint="Voorkomt verschuiven per ongeluk"
            checked={placement.locked}
            onChange={(value) => {
              if (value) updatePlacement(placement.id, { locked: true });
              else updatePlacement(placement.id, { locked: false });
            }}
          />
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={duplicateSelected}>
              Dupliceren
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => removeSelected()}
              disabled={placement.locked}
            >
              Verwijderen
            </button>
          </div>
        </div>
      </Section>

      {issues.length > 0 ? (
        <Section title="Controle">
          <div className="stack-sm">
            {issues.map((issue) => (
              <div key={issue.id} className={`issue-row ${issue.severity}`}>
                <span className="issue-icon">{issue.severity === 'error' ? '⛔' : '⚠'}</span>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
