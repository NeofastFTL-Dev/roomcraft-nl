import { useEffect, useMemo, useState } from 'react';
import { createDesign } from '@shared/design';
import { createDefaultRoom } from '@shared/geometry';
import { api, ApiError, type ProjectSummary } from '@/api';
import { formatEuro } from '@shared/budget';
import { relativeDate } from '@/lib/format';

interface Props {
  userName: string;
  onOpenProject: (id: string) => void;
  onLogout?: () => void;
}

const TEMPLATES: Array<{ id: string; label: string; description: string; build: () => ReturnType<typeof createDesign> }> = [
  {
    id: 'living',
    label: 'Woonkamer 5,2 × 4,2 m',
    description: 'Ruime woonkamer met deur en raam op de juiste plek.',
    build: () => {
      const room = createDefaultRoom(5.2, 4.2, 2.6);
      const design = createDesign(room);
      design.budget = { limit: 2500, currency: 'EUR' };
      return design;
    },
  },
  {
    id: 'bedroom',
    label: 'Slaapkamer 3,6 × 3,2 m',
    description: 'Compacte slaapkamer met één raam.',
    build: () => {
      const room = createDefaultRoom(3.6, 3.2, 2.6);
      room.name = 'Slaapkamer';
      room.wallColor = '#d9c7b8';
      const design = createDesign(room);
      design.budget = { limit: 1800, currency: 'EUR' };
      return design;
    },
  },
  {
    id: 'office',
    label: 'Werkkamer 3,0 × 3,0 m',
    description: 'Vierkante kamer, ideaal voor een bureau bij het raam.',
    build: () => {
      const room = createDefaultRoom(3, 3, 2.5);
      room.name = 'Werkkamer';
      const design = createDesign(room);
      design.budget = { limit: 1200, currency: 'EUR' };
      return design;
    },
  },
  {
    id: 'empty',
    label: 'Lege kamer 5,0 × 4,0 m',
    description: 'Begin met een standaard rechthoekige plattegrond.',
    build: () => createDesign(createDefaultRoom(5, 4, 2.6)),
  },
];

export function DashboardPage({ userName, onOpenProject, onLogout }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('Mijn kamer');
  const [templateId, setTemplateId] = useState('living');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);

  const refresh = async (): Promise<void> => {
    try {
      const result = await api.listProjects();
      setProjects(result.projects);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Projecten laden mislukt.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const stats = useMemo(() => {
    const items = projects.reduce((sum, project) => sum + project.itemCount, 0);
    const latest = projects[0]?.updatedAt;
    return { items, latest };
  }, [projects]);

  const createProject = async (): Promise<void> => {
    setCreating(true);
    try {
      const template = TEMPLATES.find((entry) => entry.id === templateId) ?? TEMPLATES[0];
      const design = template.build();
      design.room.name = name;
      const result = await api.createProject({
        name: name.trim() || 'Naamloos ontwerp',
        description: template.description,
        design,
      });
      setCreateOpen(false);
      onOpenProject(result.project.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Project aanmaken mislukt.');
    } finally {
      setCreating(false);
    }
  };

  const duplicate = async (project: ProjectSummary): Promise<void> => {
    try {
      await api.duplicateProject(project.id);
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Dupliceren mislukt.');
    }
  };

  const remove = async (): Promise<void> => {
    if (!deleteTarget) return;
    try {
      await api.deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Verwijderen mislukt.');
    }
  };

  return (
    <div className="dash">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <span>
            RoomCraft
            <small>NL</small>
          </span>
        </div>
        <div className="spacer" />
        <span className="tiny muted">{userName}</span>
        {onLogout ? (
          <button type="button" className="icon-btn" title="Uitloggen" onClick={onLogout}>
            ⏻
          </button>
        ) : null}
      </header>

      <main className="dash-main">
        <div className="dash-head">
          <div>
            <h1>Je interieurprojecten</h1>
            <p>Ontwerp op ware grootte, wissel tussen 2D en 3D en houd je budget in de hand.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            + Nieuw ontwerp
          </button>
        </div>

        <div className="dash-stats">
          <div className="dash-stat">
            <strong>{projects.length}</strong>
            <span>Projecten</span>
          </div>
          <div className="dash-stat">
            <strong>{stats.items}</strong>
            <span>Geplaatste meubels</span>
          </div>
          <div className="dash-stat">
            <strong>{stats.latest ? relativeDate(stats.latest) : '—'}</strong>
            <span>Laatst bewerkt</span>
          </div>
        </div>

        {error ? <div className="form-error" style={{ marginBottom: 16 }}>{error}</div> : null}

        {loading ? (
          <div className="project-grid">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton" style={{ height: 260 }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state" style={{ padding: 48 }}>
            <strong>Nog geen projecten</strong>
            Maak je eerste kamer aan en begin met het plaatsen van meubels.
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                Eerste ontwerp maken
              </button>
            </div>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <article key={project.id} className="project-card">
                <button
                  type="button"
                  className="project-preview"
                  onClick={() => onOpenProject(project.id)}
                  aria-label={`Open ${project.name}`}
                >
                  {project.thumbnail ? (
                    <img src={project.thumbnail} alt="" />
                  ) : (
                    <span className="mini-plan" />
                  )}
                </button>
                <div className="project-body">
                  <div className="project-title">{project.name}</div>
                  <div className="project-meta">
                    <span>{project.roomName}</span>
                    <span>{project.itemCount} meubels</span>
                    {project.budgetLimit ? <span>{formatEuro(project.budgetLimit)} budget</span> : null}
                  </div>
                  <div className="project-meta">
                    <span>Bewerkt {relativeDate(project.updatedAt)}</span>
                  </div>
                </div>
                <div className="project-actions">
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => onOpenProject(project.id)}>
                    Openen
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => void duplicate(project)}>
                    Dupliceren
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => setDeleteTarget(project)}
                  >
                    Verwijderen
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {createOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <div>
                <h2>Nieuw ontwerp</h2>
                <p className="tiny muted">Kies een startpunt; je kunt alle maten later aanpassen.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setCreateOpen(false)}>
                ✕
              </button>
            </div>
            <label className="field">
              <span className="field-label">Naam</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </label>
            <div className="stack-sm">
              <span className="field-label">Startpunt</span>
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`item-row ${templateId === template.id ? 'active' : ''}`}
                  onClick={() => setTemplateId(template.id)}
                >
                  <span className="item-dot" style={{ background: templateId === template.id ? '#e0a35c' : '#6b6156' }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span className="item-name" style={{ display: 'block' }}>
                      {template.label}
                    </span>
                    <span className="item-sub">{template.description}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
                Annuleren
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void createProject()}
                disabled={creating}
              >
                {creating ? 'Aanmaken…' : 'Ontwerp aanmaken'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <h2>Project verwijderen?</h2>
              <button type="button" className="icon-btn" onClick={() => setDeleteTarget(null)}>
                ✕
              </button>
            </div>
            <p className="muted">
              "{deleteTarget.name}" en alle bewaarde versies worden definitief verwijderd. Dit kan niet
              ongedaan worden gemaakt.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
                Annuleren
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void remove()}>
                Definitief verwijderen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
