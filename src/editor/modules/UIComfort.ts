import type { Editor } from '../Editor';
import type { Game } from '../../core/Game';

interface SnapSettings {
  translate: number;
  rotate: number;
  scale: number;
}

export class EditorUIComfort {
  private snap: SnapSettings = { translate: 0.5, rotate: 15, scale: 0.1 };
  private overlay?: HTMLElement;
  private infoTimeout?: number;

  constructor(private editor: Editor, private game: Game) {
    this.createOverlay();
    this.editor.events.on('selection:changed', ({ selection }) => {
      if (selection) {
        this.showInfo(`Auswahl: ${selection.name}`);
      } else {
        this.showInfo('Keine Auswahl');
      }
    });
  }

  dispose() {
    if (this.overlay && this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
    this.overlay = undefined;
  }

  setGridVisible(visible: boolean) {
    this.game.setHelpersVisible(visible);
    this.showInfo(visible ? 'Grid sichtbar' : 'Grid versteckt');
  }

  setSnapSettings(settings: Partial<SnapSettings>) {
    this.snap = { ...this.snap, ...settings };
    this.editor.events.emit('ui:snap', this.snap);
    this.showInfo(
      `Snapping: T ${this.snap.translate.toFixed(2)} | R ${this.snap.rotate.toFixed(1)}° | S ${this.snap.scale.toFixed(2)}`,
    );
  }

  getSnapSettings() {
    return this.snap;
  }

  toggleStats(enabled: boolean) {
    const canvas = this.game.renderer.domElement;
    canvas.style.outline = enabled ? '2px solid #00c6ff' : '';
    this.editor.events.emit('ui:stats', enabled);
    this.showInfo(enabled ? 'Focus Mode aktiv' : 'Focus Mode aus');
  }

  setOverlayMessage(message: string, duration = 2000) {
    this.showInfo(message, duration);
  }

  private createOverlay() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const overlay = document.createElement('div');
    overlay.className = 'editor-overlay';
    Object.assign(overlay.style, {
      position: 'absolute',
      top: '12px',
      left: '12px',
      padding: '8px 12px',
      borderRadius: '6px',
      background: 'rgba(16, 21, 28, 0.75)',
      color: '#f0f6ff',
      fontFamily: 'Inter, sans-serif',
      fontSize: '13px',
      pointerEvents: 'none',
      transition: 'opacity 0.2s ease',
      opacity: '0',
      zIndex: '20',
      backdropFilter: 'blur(4px)',
      maxWidth: '320px',
    });
    const containerStyle = window.getComputedStyle(this.game.container);
    if (containerStyle.position === 'static') {
      this.game.container.style.position = 'relative';
    }
    this.game.container.appendChild(overlay);
    this.overlay = overlay;
  }

  private showInfo(message: string, duration = 2000) {
    if (!this.overlay) return;
    this.overlay.textContent = message;
    this.overlay.style.opacity = '1';
    if (this.infoTimeout) {
      clearTimeout(this.infoTimeout);
    }
    this.infoTimeout = window.setTimeout(() => {
      if (this.overlay) {
        this.overlay.style.opacity = '0';
      }
    }, duration);
  }
}
