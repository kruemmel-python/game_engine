import { AssetManager } from '../assets/AssetManager';
import type { Game } from '../core/Game';
import type { Inspector } from './Inspector';
import type { SimulationController } from './SimulationController';
import type { DebugTools } from './DebugTools';
import type { CollaborationManager } from './CollaborationManager';
import type { SceneManager } from './SceneManager';

export class EditorUI {
  readonly element: HTMLDivElement;
  private inspectorContainer: HTMLDivElement;
  private statsContainer: HTMLDivElement;
  private snapshotsContainer: HTMLDivElement;
  private assetProgressLabel: HTMLDivElement;

  constructor(
    private game: Game,
    private inspector: Inspector,
    private simulation: SimulationController,
    private assets: AssetManager,
    private debug: DebugTools,
    private collaboration: CollaborationManager,
    private scenes: SceneManager,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'editor-ui';
    Object.assign(this.element.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      width: '320px',
      height: '100%',
      background: 'rgba(20,20,23,0.85)',
      color: '#f8f8f8',
      fontFamily: 'Inter, sans-serif',
      fontSize: '12px',
      overflowY: 'auto',
      pointerEvents: 'auto',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      padding: '12px 16px',
      boxSizing: 'border-box',
    });

    const header = document.createElement('div');
    header.textContent = 'Editor Werkzeuge';
    header.style.fontWeight = '600';
    header.style.marginBottom = '8px';
    header.style.letterSpacing = '0.08em';
    this.element.appendChild(header);

    this.assetProgressLabel = document.createElement('div');
    this.assetProgressLabel.style.marginBottom = '8px';
    this.assetProgressLabel.style.opacity = '0.8';
    this.element.appendChild(this.assetProgressLabel);

    this.element.appendChild(this.makeSimulationControls());
    this.inspectorContainer = document.createElement('div');
    this.element.appendChild(this.inspectorContainer);
    this.statsContainer = document.createElement('div');
    this.statsContainer.style.marginTop = '12px';
    this.element.appendChild(this.statsContainer);
    this.snapshotsContainer = document.createElement('div');
    this.snapshotsContainer.style.marginTop = '12px';
    this.element.appendChild(this.snapshotsContainer);

    document.body.appendChild(this.element);

    this.inspector.events.on('selected', () => this.renderInspector());
    this.inspector.events.on('changed', () => this.renderInspector());
    this.debug.events.on('stats', () => this.renderStats());
    this.scenes.events.on('changed', () => this.renderInspector());
    this.collaboration.events.on('saved', () => this.renderSnapshots());
    this.collaboration.events.on('deleted', () => this.renderSnapshots());
    this.collaboration.events.on('imported', () => this.renderSnapshots());
    this.renderInspector();
    this.renderStats();
    this.renderSnapshots();
    setInterval(() => this.updateAssetProgress(), 500);
    this.updateAssetProgress();
  }

  private makeSimulationControls() {
    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '12px';

    const label = document.createElement('div');
    label.textContent = 'Simulation';
    label.style.fontWeight = '600';
    label.style.marginBottom = '4px';
    wrapper.appendChild(label);

    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.gap = '6px';

    const play = document.createElement('button');
    play.textContent = 'Play';
    play.onclick = () => this.simulation.play();

    const pause = document.createElement('button');
    pause.textContent = 'Pause';
    pause.onclick = () => this.simulation.pause();

    const step = document.createElement('button');
    step.textContent = 'Step';
    step.onclick = () => this.simulation.step();

    const styleButton = (btn: HTMLButtonElement) => {
      btn.style.flex = '1';
      btn.style.background = 'rgba(255,255,255,0.06)';
      btn.style.border = '1px solid rgba(255,255,255,0.1)';
      btn.style.color = 'inherit';
      btn.style.padding = '6px 8px';
      btn.style.cursor = 'pointer';
      btn.style.borderRadius = '4px';
    };

    [play, pause, step].forEach(styleButton);
    buttons.append(play, pause, step);
    wrapper.appendChild(buttons);

    const timeScaleLabel = document.createElement('label');
    timeScaleLabel.textContent = 'Zeitfaktor';
    timeScaleLabel.style.display = 'block';
    timeScaleLabel.style.marginTop = '8px';
    wrapper.appendChild(timeScaleLabel);

    const timeScale = document.createElement('input');
    timeScale.type = 'range';
    timeScale.min = '0.1';
    timeScale.max = '4';
    timeScale.step = '0.1';
    timeScale.value = this.simulation.getTimeScale().toString();
    timeScale.oninput = () => this.simulation.setTimeScale(Number(timeScale.value));
    timeScale.style.width = '100%';
    wrapper.appendChild(timeScale);

    return wrapper;
  }

  private renderInspector() {
    const selected = this.inspector.getSelection();
    this.inspectorContainer.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = 'Inspector';
    title.style.fontWeight = '600';
    title.style.margin = '8px 0 4px';
    this.inspectorContainer.appendChild(title);
    if (!selected) {
      const empty = document.createElement('div');
      empty.textContent = 'Kein Objekt ausgewählt';
      empty.style.opacity = '0.6';
      this.inspectorContainer.appendChild(empty);
      return;
    }
    const name = document.createElement('div');
    name.textContent = selected.name;
    name.style.fontSize = '14px';
    name.style.marginBottom = '6px';
    this.inspectorContainer.appendChild(name);

    for (const property of this.inspector.getProperties()) {
      const row = document.createElement('div');
      row.style.marginBottom = '6px';
      const label = document.createElement('div');
      label.textContent = property.label;
      label.style.fontSize = '11px';
      label.style.textTransform = 'uppercase';
      label.style.opacity = '0.7';
      row.appendChild(label);

      switch (property.type) {
        case 'string':
          row.appendChild(this.makeStringInput(property.path, String(property.value ?? '')));
          break;
        case 'number':
          row.appendChild(this.makeNumberInput(property.path, Number(property.value ?? 0)));
          break;
        case 'boolean':
          row.appendChild(this.makeBooleanInput(property.path, Boolean(property.value)));
          break;
        case 'vector3':
          row.appendChild(this.makeVectorRow(property.path, property.value as any));
          break;
        case 'quaternion':
          row.appendChild(this.makeQuaternionRow(property.path, property.value as any));
          break;
      }
      this.inspectorContainer.appendChild(row);
    }
  }

  private makeStringInput(path: string, value: string) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.width = '100%';
    input.onchange = () => this.inspector.setProperty(path, input.value);
    return input;
  }

  private makeNumberInput(path: string, value: number) {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value.toString();
    input.style.width = '100%';
    input.onchange = () => this.inspector.setProperty(path, Number(input.value));
    return input;
  }

  private makeBooleanInput(path: string, value: boolean) {
    const wrapper = document.createElement('label');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '6px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = value;
    checkbox.onchange = () => this.inspector.setProperty(path, checkbox.checked);
    const text = document.createElement('span');
    text.textContent = value ? 'Aktiv' : 'Inaktiv';
    checkbox.addEventListener('change', () => {
      text.textContent = checkbox.checked ? 'Aktiv' : 'Inaktiv';
    });
    wrapper.append(checkbox, text);
    return wrapper;
  }

  private makeVectorRow(path: string, value: { x: number; y: number; z: number }) {
    const container = document.createElement('div');
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(3, 1fr)';
    container.style.gap = '4px';
    ['x', 'y', 'z'].forEach((axis) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = Number((value as any)[axis]).toFixed(3);
      input.onchange = () => this.inspector.setProperty(`${path}.${axis}`, Number(input.value));
      container.appendChild(input);
    });
    return container;
  }

  private makeQuaternionRow(path: string, value: { x: number; y: number; z: number; w: number }) {
    const container = document.createElement('div');
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(4, 1fr)';
    container.style.gap = '4px';
    ['x', 'y', 'z', 'w'].forEach((axis) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = Number((value as any)[axis]).toFixed(3);
      input.onchange = () => this.inspector.setProperty(`${path}.${axis}`, Number(input.value));
      container.appendChild(input);
    });
    return container;
  }

  private renderStats() {
    const stats = this.debug.getStats();
    this.statsContainer.innerHTML = '';
    const label = document.createElement('div');
    label.textContent = 'Debugging';
    label.style.fontWeight = '600';
    label.style.marginBottom = '4px';
    this.statsContainer.appendChild(label);

    const list = document.createElement('ul');
    list.style.listStyle = 'none';
    list.style.padding = '0';
    list.style.margin = '0';
    const entries = [
      ['FPS', stats.fps.toString()],
      ['Frame (ms)', stats.frameTime.toFixed(2)],
      ['Objekte', stats.objects.toString()],
      ['Bodies', stats.bodies.toString()],
      ['TimeScale', stats.timeScale.toFixed(2)],
      ['Kollisionen', stats.collisions.toString()],
    ];
    for (const [key, value] of entries) {
      const item = document.createElement('li');
      item.textContent = `${key}: ${value}`;
      item.style.marginBottom = '2px';
      list.appendChild(item);
    }
    this.statsContainer.appendChild(list);
  }

  private renderSnapshots() {
    this.snapshotsContainer.innerHTML = '';
    const label = document.createElement('div');
    label.textContent = 'Kollaboration';
    label.style.fontWeight = '600';
    label.style.marginBottom = '4px';
    this.snapshotsContainer.appendChild(label);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '4px';

    const snapshots = this.collaboration.listSnapshots();
    if (!snapshots.length) {
      const empty = document.createElement('div');
      empty.textContent = 'Keine Snapshots gespeichert';
      empty.style.opacity = '0.6';
      list.appendChild(empty);
    }

    for (const snapshot of snapshots) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '4px';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = snapshot;
      labelSpan.style.flex = '1';
      const load = document.createElement('button');
      load.textContent = 'Export';
      load.onclick = () => this.collaboration.exportSnapshot(snapshot);
      const remove = document.createElement('button');
      remove.textContent = 'Löschen';
      remove.onclick = () => {
        this.collaboration.deleteSnapshot(snapshot);
        this.renderSnapshots();
      };
      [load, remove].forEach((btn) => {
        btn.style.background = 'rgba(255,255,255,0.06)';
        btn.style.border = '1px solid rgba(255,255,255,0.1)';
        btn.style.color = 'inherit';
        btn.style.cursor = 'pointer';
      });
      row.append(labelSpan, load, remove);
      list.appendChild(row);
    }

    const createButton = document.createElement('button');
    createButton.textContent = 'Snapshot speichern';
    createButton.style.marginTop = '6px';
    createButton.onclick = () => {
      const name = prompt('Snapshot Name');
      if (!name) return;
      this.collaboration.saveSnapshot(name);
      this.renderSnapshots();
    };
    list.appendChild(createButton);

    this.snapshotsContainer.appendChild(list);
  }

  private updateAssetProgress() {
    const progress = this.assets.getLoadingProgress();
    const pct = Math.round(progress * 100);
    this.assetProgressLabel.textContent = `Assets geladen: ${pct}%`;
    this.element.dataset.assetProgress = `${pct}%`;
  }
}
