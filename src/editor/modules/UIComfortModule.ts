import type { EditorModule } from './types';

type PanelState = 'hidden' | 'docked' | 'floating';

interface PanelConfig {
  id: string;
  title: string;
  state: PanelState;
  visible: boolean;
}

export class UIComfortModule implements EditorModule {
  readonly id = 'ui';
  readonly label = 'UI & Editor-Komfort';

  private panels = new Map<string, PanelConfig>();
  private theme: 'dark' | 'light' = 'dark';
  private statusMessages: string[] = [];

  dispose(): void {
    this.panels.clear();
    this.statusMessages = [];
  }

  registerPanel(id: string, title: string, initialState: PanelState = 'docked') {
    if (!this.panels.has(id)) {
      this.panels.set(id, { id, title, state: initialState, visible: true });
    }
  }

  setPanelState(id: string, state: PanelState) {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.state = state;
    panel.visible = state !== 'hidden';
  }

  togglePanel(id: string) {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.visible = !panel.visible;
    panel.state = panel.visible ? panel.state || 'docked' : 'hidden';
  }

  listPanels() {
    return Array.from(this.panels.values());
  }

  getTheme() {
    return this.theme;
  }

  setTheme(theme: 'dark' | 'light') {
    this.theme = theme;
    if (typeof document !== 'undefined') {
      document.documentElement.dataset['editorTheme'] = theme;
    }
  }

  pushStatus(message: string) {
    this.statusMessages.push(message);
    if (this.statusMessages.length > 5) {
      this.statusMessages.shift();
    }
  }

  getStatusLog() {
    return [...this.statusMessages];
  }
}
