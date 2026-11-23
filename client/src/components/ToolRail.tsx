import { useEditorStore, type Tool } from '@/stores/editorStore';

const TOOLS: Array<{ id: Tool; icon: string; label: string; hint: string }> = [
  { id: 'select', icon: '↖', label: 'Kies', hint: 'Selecteer en verplaats meubels' },
  { id: 'pan', icon: '✥', label: 'Schuif', hint: 'Verschuif de plattegrond' },
  { id: 'wall', icon: '▭', label: 'Wand', hint: 'Teken een scheidingswand' },
  { id: 'door', icon: '⌷', label: 'Deur', hint: 'Plaats een deur in een muur' },
  { id: 'window', icon: '▤', label: 'Raam', hint: 'Plaats een raam in een muur' },
  { id: 'measure', icon: '↔', label: 'Meet', hint: 'Meet een afstand' },
];

export function ToolRail() {
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);

  return (
    <nav className="tool-rail" aria-label="Gereedschap">
      {TOOLS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`tool ${tool === entry.id ? 'active' : ''}`}
          title={entry.hint}
          aria-pressed={tool === entry.id}
          onClick={() => setTool(entry.id)}
        >
          <span aria-hidden>{entry.icon}</span>
          <span>{entry.label}</span>
        </button>
      ))}
    </nav>
  );
}
