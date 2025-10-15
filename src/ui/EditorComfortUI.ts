import { EventBus } from '../core/EventBus';

export interface PanelState {
  id: string;
  label: string;
  visible: boolean;
  pinned: boolean;
}

export class EditorComfortUI {
  readonly events = new EventBus();
  readonly panels = new Map<string, PanelState>();
  private quickActions: Array<{ id: string; label: string; action: () => void }> = [];

  registerPanel(id: string, label: string, options: { visible?: boolean; pinned?: boolean } = {}) {
    const state: PanelState = {
      id,
      label,
      visible: options.visible ?? true,
      pinned: options.pinned ?? false,
    };
    this.panels.set(id, state);
    this.events.emit('panel-registered', state);
    return state;
  }

  togglePanel(id: string, force?: boolean) {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.visible = force ?? !panel.visible;
    this.events.emit('panel-visibility', panel);
  }

  pinPanel(id: string, pinned?: boolean) {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.pinned = pinned ?? !panel.pinned;
    this.events.emit('panel-pinned', panel);
  }

  addQuickAction(id: string, label: string, action: () => void) {
    this.quickActions.push({ id, label, action });
    this.events.emit('quick-action-registered', { id, label });
  }

  triggerQuickAction(id: string) {
    const action = this.quickActions.find((item) => item.id === id);
    action?.action();
  }

  listQuickActions() {
    return [...this.quickActions];
  }
}
