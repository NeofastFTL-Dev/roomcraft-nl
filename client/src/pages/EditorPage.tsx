import { useEffect, useMemo, useState } from 'react';
import { analyzeFit } from '@shared/fit';
import { computeBudget, formatEuro } from '@shared/budget';
import { roomArea } from '@shared/geometry';
import { api, ApiError } from '@/api';
import { useEditorStore, type EditorView } from '@/stores/editorStore';
import { RoomCanvas2D } from '@/components/RoomCanvas2D';
import { RoomView3D } from '@/components/RoomView3D';
import { ToolRail } from '@/components/ToolRail';
import { Inspector } from '@/components/Inspector';
import { dateTime, m2 } from '@/lib/format';

interface Props {
  projectId: string;
  userName: string;
  onExit: () => void;
  onLogout?: () => void;
}

export function EditorPage({ projectId, userName, onExit, onLogout }: Props) {
  const load = useEditorStore((state) => state.load);
  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  const projectName = useEditorStore((state) => state.projectName);
  const dirty = useEditorStore((state) => state.dirty);
  const saving = useEditorStore((state) => state.saving);
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt);
  const view = useEditorStore((state) => state.view);
  const notice = useEditorStore((state) => state.notice);
  const pendingProposal = useEditorStore((state) => state.pendingProposal);

  const setView = useEditorStore((state) => state.setView);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const save = useEditorStore((state) => state.save);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore((state) => state.past.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);
  const clearNotice = useEditorStore((state) => state.clearNotice);
  const applyProposal = useEditorStore((state) => state.applyProposal);
  const previewProposal = useEditorStore((state) => state.previewProposal);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [project, catalog] = await Promise.all([
          api.getProject(projectId),
          api.catalog({ limit: 200 }),
        ]);
        if (cancelled) return;
        load({
          projectId: project.project.id,
          name: project.project.name,
          description: project.project.description,
          design: project.project.design,
          products: catalog.products,
        });
        setLoading(false);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : 'Project laden mislukt.');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, load]);

  useEffect(() => {
    document.title = projectName ? `${projectName} — RoomCraft NL` : 'RoomCraft NL';
  }, [projectName]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => clearNotice(), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice, clearNotice]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent): void => {
      if (!useEditorStore.getState().dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const store = useEditorStore.getState();
      const meta = event.ctrlKey || event.metaKey;

      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void store.save();
        return;
      }
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        store.redo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (store.selection.length > 0) {
          event.preventDefault();
          store.removeSelected();
        }
        return;
      }
      if (event.key === 'Escape') {
        store.select(null);
        store.selectWall(null);
        store.setTool('select');
        return;
      }
      if (event.key.toLowerCase() === 'r' && !meta) {
        store.rotateSelected(90);
        return;
      }
      if (event.key.toLowerCase() === 'd' && !meta) {
        store.duplicateSelected();
        return;
      }
      const step = event.shiftKey ? 0.5 : 0.1;
      if (event.key === 'ArrowLeft') store.nudgeSelected(-step, 0);
      if (event.key === 'ArrowRight') store.nudgeSelected(step, 0);
      if (event.key === 'ArrowUp') store.nudgeSelected(0, -step);
      if (event.key === 'ArrowDown') store.nudgeSelected(0, step);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const issues = useMemo(() => analyzeFit(design, { products }), [design, products]);
  const budget = useMemo(() => computeBudget(design, products), [design, products]);
  const errors = issues.filter((issue) => issue.severity === 'error').length;

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="spinner" />
        <span>Project en catalogus laden…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <div className="empty-state" style={{ maxWidth: 420 }}>
          <strong>Project kon niet geladen worden</strong>
          {error}
        </div>
        <button type="button" className="btn" onClick={onExit}>
          Terug naar dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          title="Terug naar dashboard"
          aria-label="Terug naar dashboard"
          onClick={onExit}
        >
          ←
        </button>
        <div className="brand">
          <span className="brand-mark">R</span>
          <span>
            RoomCraft
            <small>NL</small>
          </span>
        </div>
        <div className="divider-v" />
        <input
          className="project-name-input"
          value={projectName}
          aria-label="Projectnaam"
          onChange={(event) => setProjectName(event.target.value)}
        />
        <div className="save-state">
          <span className={`status-dot ${dirty ? 'dirty' : ''}`} />
          {saving
            ? 'Opslaan…'
            : dirty
              ? 'Wijzigingen niet opgeslagen'
              : lastSavedAt
                ? `Opgeslagen ${dateTime(lastSavedAt)}`
                : 'Opgeslagen'}
        </div>

        <div className="spacer" />

        <div className="row" style={{ gap: 3 }}>
          <button
            type="button"
            className="icon-btn"
            title="Ongedaan maken (Ctrl+Z)"
            aria-label="Ongedaan maken"
            onClick={undo}
            disabled={!canUndo}
          >
            ↶
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Opnieuw (Ctrl+Y)"
            aria-label="Opnieuw"
            onClick={redo}
            disabled={!canRedo}
          >
            ↷
          </button>
        </div>

        <div className="row" style={{ gap: 3 }}>
          {(['split', '2d', '3d'] as EditorView[]).map((entry) => (
            <button
              key={entry}
              type="button"
              className={`btn btn-sm ${view === entry ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView(entry)}
              title={
                entry === 'split' ? '2D en 3D naast elkaar' : entry === '2d' ? 'Alleen plattegrond' : 'Alleen 3D'
              }
            >
              {entry === 'split' ? '2D + 3D' : entry.toUpperCase()}
            </button>
          ))}
        </div>

        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>

        <div className="divider-v" />
        <div className="row" style={{ gap: 6 }}>
          <span className="tiny muted">{userName}</span>
          {onLogout ? (
            <button
              type="button"
              className="icon-btn"
              title="Uitloggen"
              aria-label="Uitloggen"
              onClick={onLogout}
            >
              ⏻
            </button>
          ) : null}
        </div>
      </header>

      <div className="editor-body">
        <ToolRail />

        <div className="stage-area">
          {pendingProposal ? (
            <div className="proposal-banner">
              <div>
                <strong>Voorstel: {pendingProposal.title}</strong>
                <div className="tiny muted">
                  Groene laag in de plattegrond · {formatEuro(pendingProposal.estimatedCost)} ·{' '}
                  {pendingProposal.placements.length} meubels
                </div>
              </div>
              <div className="row">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => previewProposal(null)}>
                  Verwerpen
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => applyProposal(pendingProposal)}
                >
                  Goedkeuren
                </button>
              </div>
            </div>
          ) : null}

          <div className="views">
            {view !== '3d' ? (
              <div className="view-pane">
                <div className="view-pane-header">
                  <span className="view-badge">Plattegrond · 1:50</span>
                </div>
                <RoomCanvas2D />
              </div>
            ) : null}
            {view !== '2d' ? (
              <div className="view-pane">
                <RoomView3D />
              </div>
            ) : null}
          </div>

          <div className="statusbar">
            <span>
              <strong>{m2(roomArea(design.room))}</strong> vloeroppervlak
            </span>
            <span>
              <strong>{design.placements.length}</strong> meubels
            </span>
            <span>
              <strong>{formatEuro(budget.total)}</strong> totaal
            </span>
            <span className={errors > 0 ? 'status-error' : 'status-ok'}>
              {errors > 0 ? `${errors} blokkade${errors === 1 ? '' : 's'}` : 'Pasvorm in orde'}
            </span>
            <span className="spacer" />
            <span className="tiny muted">Sleep meubels · R draaien · D dupliceren · Ctrl+Z ongedaan</span>
          </div>
        </div>

        <Inspector />
      </div>

      {notice ? (
        <div className={`toast ${notice.kind}`} role="status">
          <span>{notice.kind === 'error' ? '⛔' : notice.kind === 'success' ? '✓' : 'ⓘ'}</span>
          <span>{notice.text}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={clearNotice}>
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
