import { roomArea, roomBounds, roomPerimeter, wallLength } from '@shared/geometry';
import { useEditorStore } from '@/stores/editorStore';
import { m2, meters } from '@/lib/format';
import { NumberField, Section } from '../ui';

export function RoomPanel() {
  const design = useEditorStore((state) => state.design);
  const selectedWallId = useEditorStore((state) => state.selectedWallId);
  const setRoomDimensions = useEditorStore((state) => state.setRoomDimensions);
  const setCeilingHeight = useEditorStore((state) => state.setCeilingHeight);
  const setGridSnap = useEditorStore((state) => state.setGridSnap);
  const setRoomName = useEditorStore((state) => state.setRoomName);
  const updateWall = useEditorStore((state) => state.updateWall);
  const removeWall = useEditorStore((state) => state.removeWall);
  const selectWall = useEditorStore((state) => state.selectWall);
  const updateOpening = useEditorStore((state) => state.updateOpening);
  const removeOpening = useEditorStore((state) => state.removeOpening);
  const setTool = useEditorStore((state) => state.setTool);

  const { room } = design;
  const bounds = roomBounds(room);
  const width = Math.max(0.1, bounds.maxX - bounds.minX);
  const depth = Math.max(0.1, bounds.maxZ - bounds.minZ);
  const wall = room.walls.find((entry) => entry.id === selectedWallId);

  return (
    <div className="stack">
      <Section title="Kamer">
        <div className="stack-sm">
          <label className="field">
            <span className="field-label">Naam</span>
            <input
              className="input"
              value={room.name}
              onChange={(event) => setRoomName(event.target.value)}
            />
          </label>
          <div className="grid-2">
            <NumberField
              label="Breedte"
              value={width}
              min={1.5}
              max={20}
              suffix="m"
              onCommit={(value) => setRoomDimensions(value, depth)}
            />
            <NumberField
              label="Diepte"
              value={depth}
              min={1.5}
              max={20}
              suffix="m"
              onCommit={(value) => setRoomDimensions(width, value)}
            />
          </div>
          <div className="grid-2">
            <NumberField
              label="Plafondhoogte"
              value={room.ceilingHeight}
              min={1.9}
              max={4.5}
              suffix="m"
              onCommit={setCeilingHeight}
            />
            <label className="field">
              <span className="field-label">Raster</span>
              <select
                className="select"
                value={room.gridSnap}
                onChange={(event) => setGridSnap(Number(event.target.value))}
              >
                <option value={0.05}>5 cm</option>
                <option value={0.1}>10 cm</option>
                <option value={0.25}>25 cm</option>
                <option value={0.5}>50 cm</option>
              </select>
            </label>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-value">{m2(roomArea(room))}</div>
              <div className="stat-label">Vloeroppervlak</div>
            </div>
            <div className="stat">
              <div className="stat-value">{meters(roomPerimeter(room)).replace(' m', '')} m</div>
              <div className="stat-label">Omtrek</div>
            </div>
            <div className="stat">
              <div className="stat-value">{(roomArea(room) * room.ceilingHeight).toFixed(0)}</div>
              <div className="stat-label">m³ inhoud</div>
            </div>
          </div>
          <p className="hint">
            De plattegrond is de enige bron van waarheid: de 2D-plattegrond en 3D-weergave worden uit
            dezelfde muurgeometrie opgebouwd.
          </p>
        </div>
      </Section>

      <Section
        title={`Muren (${room.walls.length})`}
        action={
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTool('wall')}>
            + Wand
          </button>
        }
      >
        <div className="items-list">
          {room.walls.map((entry, index) => {
            const length = wallLength(entry);
            const active = entry.id === selectedWallId;
            return (
              <button
                key={entry.id}
                type="button"
                className={`item-row ${active ? 'active' : ''}`}
                onClick={() => selectWall(active ? null : entry.id)}
              >
                <span className="item-dot" style={{ background: active ? '#e0a35c' : '#6b6156' }} />
                <span className="item-name">
                  {entry.kind === 'exterior' ? 'Buitenmuur' : 'Scheidingswand'} {index + 1}
                </span>
                <span className="item-sub">{meters(length)}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {wall ? (
        <Section title="Geselecteerde muur">
          <div className="stack-sm">
            <div className="grid-2">
              <NumberField
                label="Dikte"
                value={wall.thickness}
                min={0.05}
                max={0.5}
                decimals={2}
                suffix="m"
                onCommit={(value) => updateWall(wall.id, { thickness: value })}
              />
              <NumberField
                label="Hoogte"
                value={wall.height}
                min={1}
                max={room.ceilingHeight}
                decimals={2}
                suffix="m"
                onCommit={(value) => updateWall(wall.id, { height: value })}
              />
            </div>
            <div className="tiny muted">
              Lengte {meters(wallLength(wall))} · {wall.openings.length} opening(en)
            </div>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => setTool('door')}>
                + Deur
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setTool('window')}>
                + Raam
              </button>
              {wall.kind === 'partition' ? (
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => removeWall(wall.id)}
                >
                  Verwijderen
                </button>
              ) : null}
            </div>

            {wall.openings.map((opening) => (
              <div key={opening.id} className="card stack-sm">
                <div className="row-between">
                  <strong style={{ fontSize: 12.5 }}>
                    {opening.kind === 'door' ? 'Deur' : 'Raam'} · {meters(opening.width)}
                  </strong>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => removeOpening(wall.id, opening.id)}
                  >
                    ✕
                  </button>
                </div>
                <div className="grid-2">
                  <NumberField
                    label="Breedte"
                    value={opening.width}
                    min={0.3}
                    max={Math.max(0.4, wallLength(wall))}
                    suffix="m"
                    onCommit={(value) => updateOpening(wall.id, opening.id, { width: value })}
                  />
                  <NumberField
                    label="Hoogte"
                    value={opening.height}
                    min={0.3}
                    max={wall.height}
                    suffix="m"
                    onCommit={(value) => updateOpening(wall.id, opening.id, { height: value })}
                  />
                  <NumberField
                    label="Positie"
                    value={opening.center}
                    min={opening.width / 2}
                    max={wallLength(wall) - opening.width / 2}
                    suffix="m"
                    onCommit={(value) => updateOpening(wall.id, opening.id, { center: value })}
                  />
                  {opening.kind === 'window' ? (
                    <NumberField
                      label="Vensterbank"
                      value={opening.sillHeight}
                      min={0}
                      max={wall.height - opening.height}
                      suffix="m"
                      onCommit={(value) => updateOpening(wall.id, opening.id, { sillHeight: value })}
                    />
                  ) : (
                    <label className="field">
                      <span className="field-label">Scharnier</span>
                      <select
                        className="select"
                        value={opening.hinge}
                        onChange={(event) =>
                          updateOpening(wall.id, opening.id, {
                            hinge: event.target.value === 'right' ? 'right' : 'left',
                          })
                        }
                      >
                        <option value="left">Links</option>
                        <option value="right">Rechts</option>
                      </select>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
