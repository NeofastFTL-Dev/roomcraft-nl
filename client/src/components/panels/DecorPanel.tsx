import { SURFACES } from '@shared/catalog';
import { useEditorStore } from '@/stores/editorStore';
import { Section } from '../ui';

export function DecorPanel() {
  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  const setSurface = useEditorStore((state) => state.setSurface);
  const addProduct = useEditorStore((state) => state.addProduct);
  const apply = useEditorStore((state) => state.apply);
  const selection = useEditorStore((state) => state.selection);
  const updatePlacement = useEditorStore((state) => state.updatePlacement);

  const floors = SURFACES.filter((surface) => surface.kind === 'floor');
  const walls = SURFACES.filter((surface) => surface.kind === 'wall');

  const decorProducts = products.filter((product) =>
    ['decor', 'plants', 'rugs'].includes(product.category),
  );
  const selected = selection.length === 1 ? design.placements.find((p) => p.id === selection[0]) : null;

  return (
    <div className="stack">
      <Section title="Vloerafwerking">
        <div className="stack-sm">
          {floors.map((finish) => (
            <button
              key={finish.id}
              type="button"
              className={`item-row ${design.room.floor.finish === finish.id ? 'active' : ''}`}
              onClick={() => setSurface('floor', finish.id)}
            >
              <span className="item-dot" style={{ background: finish.hex }} />
              <span className="item-name">{finish.name}</span>
              <span className="item-sub">{finish.material}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Muurafwerking">
        <div className="stack-sm">
          {walls.map((finish) => (
            <button
              key={finish.id}
              type="button"
              className={`item-row ${design.room.wallFinish === finish.id ? 'active' : ''}`}
              onClick={() => setSurface('wall', finish.id)}
            >
              <span className="item-dot" style={{ background: finish.hex }} />
              <span className="item-name">{finish.name}</span>
              <span className="item-sub">{finish.hex}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Plafond">
        <label className="field">
          <span className="field-label">Plafondkleur</span>
          <input
            type="color"
            className="input"
            style={{ padding: 3, height: 36 }}
            value={design.room.ceilingColor}
            onChange={(event) =>
              apply((draft) => {
                draft.room.ceilingColor = event.target.value;
              })
            }
          />
        </label>
      </Section>

      {selected ? (
        <Section title="Geselecteerd object">
          <div className="stack-sm">
            <label className="field">
              <span className="field-label">Kleur</span>
              <input
                type="color"
                className="input"
                style={{ padding: 3, height: 36 }}
                value={selected.color ?? '#8d8880'}
                onChange={(event) => updatePlacement(selected.id, { color: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => updatePlacement(selected.id, { color: null })}
            >
              Productkleur herstellen
            </button>
          </div>
        </Section>
      ) : null}

      <Section title="Decor toevoegen">
        <div className="stack-sm">
          {decorProducts.slice(0, 12).map((product) => (
            <div key={product.id} className="row-between">
              <div>
                <div className="product-name" style={{ fontSize: 12.5 }}>
                  {product.name}
                </div>
                <div className="product-meta">€ {product.price.toFixed(2)}</div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => addProduct(product)}>
                +
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
