import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { budgetToCsv, computeBudget } from '@shared/budget';
import { parseDesignImport } from '@shared/importDesign';
import { api, ApiError, type VersionInfo } from '@/api';
import { useEditorStore } from '@/stores/editorStore';
import { canvasDataUrl, downloadFile, safeName } from '@/lib/download';
import { planPngDataUrl } from '@/lib/planStage';
import { dateTime } from '@/lib/format';
import { Section } from '../ui';

/** Reject huge files before reading them; a design is never close to this. */
const IMPORT_MAX_BYTES = 4 * 1024 * 1024;

export function ProjectPanel() {
  const projectId = useEditorStore((state) => state.projectId);
  const projectName = useEditorStore((state) => state.projectName);
  const description = useEditorStore((state) => state.projectDescription);
  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  const dirty = useEditorStore((state) => state.dirty);
  const setProjectDescription = useEditorStore((state) => state.setProjectDescription);
  const save = useEditorStore((state) => state.save);
  const notify = useEditorStore((state) => state.notify);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => computeBudget(design, products), [design, products]);

  const refreshVersions = async (): Promise<void> => {
    if (!projectId) return;
    try {
      const result = await api.listVersions(projectId);
      setVersions(result.versions);
    } catch {
      setVersions([]);
    }
  };

  useEffect(() => {
    void refreshVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const saveVersion = async (): Promise<void> => {
    if (!projectId) return;
    setBusy(true);
    try {
      const saved = await save();
      if (!saved) return;
      const name = label.trim() || `Versie ${new Date().toLocaleString('nl-NL')}`;
      await api.createVersion(projectId, name);
      setLabel('');
      await refreshVersions();
      notify('success', `Versie "${name}" opgeslagen.`);
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Versie opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (version: VersionInfo): Promise<void> => {
    if (!projectId) return;
    if (!window.confirm(`"${version.label}" terugzetten? Je huidige ontwerp wordt overschreven.`)) return;
    setBusy(true);
    try {
      const result = await api.restoreVersion(projectId, version.id);
      useEditorStore.getState().replaceDesign(result.project.design);
      notify('success', `Versie "${version.label}" hersteld.`);
    } catch (error) {
      notify('error', error instanceof ApiError ? error.message : 'Herstellen mislukt.');
    } finally {
      setBusy(false);
    }
  };

  const exportJson = (): void => {
    downloadFile(
      `${safeName(projectName)}.json`,
      JSON.stringify(
        { app: 'RoomCraft NL', exportedAt: new Date().toISOString(), name: projectName, design },
        null,
        2,
      ),
      'application/json',
    );
    notify('success', 'Ontwerp geëxporteerd als JSON.');
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    event.target.value = '';
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      notify('error', `Het bestand is te groot (max. ${Math.round(IMPORT_MAX_BYTES / 1024 / 1024)} MB).`);
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      notify('error', 'Het bestand kon niet worden gelezen.');
      return;
    }

    const result = parseDesignImport(text, products.map((product) => product.id));
    if (!result.ok) {
      notify('error', result.message);
      return;
    }
    if (
      design.placements.length > 0 &&
      !window.confirm(
        `"${file.name}" importeren? Je huidige ontwerp met ${design.placements.length} meubels wordt overschreven. Met Ctrl+Z maak je dit ongedaan.`,
      )
    ) {
      return;
    }

    useEditorStore.getState().replaceDesign(result.design);
    notify(
      'success',
      `Ontwerp geïmporteerd (${result.design.placements.length} meubels, ${result.design.room.name}).`,
    );
  };

  const exportCsv = (): void => {
    downloadFile(`${safeName(projectName)}-budget.csv`, `\uFEFF${budgetToCsv(summary)}`, 'text/csv');
    notify('success', 'Budget geëxporteerd als CSV.');
  };

  const exportPng = (which: '2d' | '3d'): void => {
    const dataUrl = which === '2d' ? planPngDataUrl(2) : canvasDataUrl('#roomcraft-3d canvas');
    if (!dataUrl) {
      notify('error', `De ${which.toUpperCase()}-weergave is niet beschikbaar om te exporteren.`);
      return;
    }
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${safeName(projectName)}-${which}.png`;
    link.click();
    notify('success', `PNG van de ${which.toUpperCase()}-weergave gedownload.`);
  };

  return (
    <div className="stack">
      <Section title="Project">
        <div className="stack-sm">
          <label className="field">
            <span className="field-label">Omschrijving</span>
            <textarea
              className="textarea"
              value={description}
              placeholder="Waar is dit ontwerp voor?"
              onChange={(event) => setProjectDescription(event.target.value)}
            />
          </label>
          <div className="row-between">
            <span className="tiny muted">{dirty ? 'Niet-opgeslagen wijzigingen' : 'Alles opgeslagen'}</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void save()}>
              Opslaan
            </button>
          </div>
        </div>
      </Section>

      <Section title="Versies">
        <div className="stack-sm">
          <div className="row">
            <input
              className="input"
              placeholder="Naam voor deze versie"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void saveVersion()}
              disabled={busy || !projectId}
            >
              Bewaren
            </button>
          </div>
          {versions.length === 0 ? (
            <p className="hint">Nog geen versies. Bewaar een momentopname voordat je ingrijpend gaat verbouwen.</p>
          ) : (
            <div className="items-list">
              {versions.map((version) => (
                <div key={version.id} className="item-row">
                  <span className="item-name">{version.label}</span>
                  <span className="item-sub">{dateTime(version.createdAt)}</span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void restore(version)}>
                    Herstel
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Importeren">
        <div className="stack-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="Ontwerpbestand kiezen"
            style={{ display: 'none' }}
            onChange={(event) => void importJson(event)}
          />
          <button
            type="button"
            className="btn btn-block"
            onClick={() => fileInputRef.current?.click()}
          >
            Ontwerp importeren (JSON)
          </button>
          <p className="hint">
            Herstelt een eerder geëxporteerd ontwerp. Het bestand wordt gevalideerd; onbekende
            producten worden geweigerd in plaats van als leeg meubel geïmporteerd.
          </p>
        </div>
      </Section>

      <Section title="Exporteren">
        <div className="stack-sm">
          <button type="button" className="btn btn-block" onClick={() => exportPng('2d')}>
            Plattegrond als PNG
          </button>
          <button type="button" className="btn btn-block" onClick={() => exportPng('3d')}>
            3D-weergave als PNG
          </button>
          <button type="button" className="btn btn-block" onClick={exportJson}>
Ontwerp als JSON
          </button>
          <button type="button" className="btn btn-block" onClick={exportCsv}>
            Budget als CSV
          </button>
          <p className="hint">
            De plattegrond wordt als samengestelde laag geëxporteerd (2× resolutie); de 3D-PNG
            gebruikt de actuele camera. Maak het browservenster groter voor een scherpere afdruk.
          </p>
        </div>
      </Section>
    </div>
  );
}
