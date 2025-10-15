import type { Game } from '../core/Game';
import type { GameObject } from '../ecs/GameObject';
import type { Editor } from '../editor/Editor';
import { PlayerController } from '../components/PlayerController';

type Options = {
  getCameraRig?: () => GameObject | undefined;
  editor?: Editor;
};

export async function mountDebugUI(game: Game, options: Options = {}) {
  const { Pane } = await import('tweakpane');
  const ensureToggleStack = () => {
    let stack = document.querySelector<HTMLDivElement>('.editor-toggle-stack');
    if (!stack) {
      const styleId = 'editor-toggle-stack-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          .editor-toggle-stack {
            position: fixed;
            top: 16px;
            right: 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 45;
            pointer-events: none;
          }
          .editor-toggle-button {
            pointer-events: auto;
            padding: 6px 12px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            background: rgba(30, 64, 175, 0.75);
            color: #e2e8f0;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.03em;
            text-transform: uppercase;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: filter 0.15s ease;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.35);
          }
          .editor-toggle-button:hover {
            filter: brightness(1.1);
          }
          .editor-toggle-button[data-role="debug"] {
            background: rgba(6, 95, 70, 0.75);
          }
        `;
        document.head.appendChild(style);
      }
      stack = document.createElement('div');
      stack.className = 'editor-toggle-stack';
      document.body.appendChild(stack);
    }
    return stack;
  };

  const ensurePanelDock = () => {
    let dock = document.querySelector<HTMLDivElement>('.editor-panel-dock');
    if (!dock) {
      const styleId = 'editor-panel-dock-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          .editor-panel-dock {
            position: fixed;
            top: 16px;
            right: 16px;
            display: flex;
            flex-wrap: wrap;
            align-items: flex-start;
            gap: 12px;
            z-index: 44;
            pointer-events: none;
            max-width: min(100vw - 32px, 960px);
          }
          .editor-panel-dock > * {
            pointer-events: auto;
          }
        `;
        document.head.appendChild(style);
      }
      dock = document.createElement('div');
      dock.className = 'editor-panel-dock';
      document.body.appendChild(dock);
    }
    return dock;
  };

  const hostId = 'debug-pane-host-styles';
  if (!document.getElementById(hostId)) {
    const style = document.createElement('style');
    style.id = hostId;
    style.textContent = `
      .debug-pane-host {
        position: relative;
        z-index: 1;
        pointer-events: auto;
        max-height: calc(100vh - 32px);
        display: flex;
        flex-direction: column;
      }
      .debug-pane-host[data-hidden="true"] {
        display: none;
      }
      .debug-pane-host .tp-dfwv {
        flex: 1;
        max-height: 100%;
        overflow-y: auto;
      }
      .debug-pane-host .debug-pane-close {
        position: absolute;
        top: -10px;
        right: -10px;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        border: none;
        background: rgba(15, 23, 42, 0.65);
        color: #e2e8f0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        line-height: 1;
      }
      .debug-pane-host .debug-pane-close:hover {
        background: rgba(30, 41, 59, 0.85);
      }
    `;
    document.head.appendChild(style);
  }

  const dock = ensurePanelDock();
  const host = document.createElement('div');
  host.className = 'debug-pane-host';
  host.dataset.hidden = 'false';
  dock.appendChild(host);

  const pane = new Pane({ title: 'Debug', container: host });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'debug-pane-close';
  closeBtn.setAttribute('aria-label', 'Debug-Panel ausblenden');
  closeBtn.textContent = '×';
  host.appendChild(closeBtn);

  const toggleStack = ensureToggleStack();
  const showBtn = document.createElement('button');
  showBtn.type = 'button';
  showBtn.className = 'editor-toggle-button';
  showBtn.dataset.role = 'debug';
  showBtn.textContent = 'Debug';
  showBtn.style.display = 'none';
  toggleStack.appendChild(showBtn);

  const setVisible = (visible: boolean) => {
    host.dataset.hidden = visible ? 'false' : 'true';
    showBtn.style.display = visible ? 'none' : 'inline-flex';
  };

  closeBtn.addEventListener('click', () => setVisible(false));
  showBtn.addEventListener('click', () => setVisible(true));

  setVisible(true);

  const getCameraFollow = () => {
    const rig = options.getCameraRig?.();
    const components = rig?.components ?? [];
    return components.find((c: any) => c.constructor?.name === 'CameraFollow');
  };

  const cameraFolder = pane.addFolder({ title: 'Camera Follow', expanded: true });
  const cameraState = { distance: 3.5, height: 1.4 };
  const followState = { enabled: true };

  cameraFolder
    .addBinding(followState, 'enabled', { label: 'Follow aktiv' })
    .on('change', (ev) => {
      window.dispatchEvent(
        new CustomEvent('editor-request-camera-mode', {
          detail: { mode: ev.value ? 'player' : 'viewer' },
        }),
      );
    });

  cameraFolder
    .addBinding(cameraState, 'distance', {
      min: 1,
      max: 10,
      step: 0.1,
      label: 'Distance',
    })
    .on('change', (ev) => {
      const follow: any = getCameraFollow();
      if (follow) follow.distance = ev.value;
    });

  cameraFolder
    .addBinding(cameraState, 'height', {
      min: 0,
      max: 5,
      step: 0.05,
      label: 'Height',
    })
    .on('change', (ev) => {
      const follow: any = getCameraFollow();
      if (follow) follow.height = ev.value;
    });

  type CameraModeDetail = { mode: 'player' | 'viewer'; hasFollow?: boolean };

  const syncCameraControls = (detail?: CameraModeDetail) => {
    const follow: any = getCameraFollow();
    if (follow) {
      cameraState.distance = follow.distance ?? cameraState.distance;
      cameraState.height = follow.height ?? cameraState.height;
      followState.enabled = typeof follow.isActive === 'function' ? follow.isActive() : follow.active !== false;
    } else if (detail) {
      followState.enabled = detail.mode === 'player';
    }
    pane.refresh();
  };

  window.addEventListener('editor-camera-mode-changed', (event) => {
    syncCameraControls((event as CustomEvent<CameraModeDetail>).detail);
  });

  syncCameraControls();

  const physicsFolder = pane.addFolder({ title: 'Physics Bodies', expanded: false });
  const bodyControls: Array<{
    folder: any;
    body: any;
    state: { x: number; y: number; z: number };
    bindings: any[];
  }> = [];

  const disposeBodyControls = () => {
    while (bodyControls.length) {
      const entry = bodyControls.pop();
      if (!entry) continue;
      entry.bindings.forEach((binding) => binding.dispose());
      entry.folder.dispose();
    }
  };

  const updateBodyFromState = (body: any, axis: 'x' | 'y' | 'z', value: number) => {
    body.position[axis] = value;
    if (body.interpolatedPosition) body.interpolatedPosition[axis] = value;
    if (body.velocity) body.velocity[axis] = 0;
  };

  const rebuildBodyControls = () => {
    disposeBodyControls();
    const bodies = game.objects.filter((o) => o.body);
    for (const go of bodies) {
      const folder = physicsFolder.addFolder({ title: go.name || 'Body', expanded: false });
      const state = {
        x: go.body!.position.x,
        y: go.body!.position.y,
        z: go.body!.position.z,
      };
      const bindings = [
        folder
          .addBinding(state, 'x', {
            label: 'pos.x',
            min: -25,
            max: 25,
            step: 0.05,
          })
          .on('change', (ev: any) => updateBodyFromState(go.body, 'x', ev.value)),
        folder
          .addBinding(state, 'y', {
            label: 'pos.y',
            min: 0,
            max: 15,
            step: 0.05,
          })
          .on('change', (ev: any) => updateBodyFromState(go.body, 'y', ev.value)),
        folder
          .addBinding(state, 'z', {
            label: 'pos.z',
            min: -25,
            max: 25,
            step: 0.05,
          })
          .on('change', (ev: any) => updateBodyFromState(go.body, 'z', ev.value)),
      ];
      bodyControls.push({ folder, state, body: go.body, bindings });
    }
  };
  physicsFolder.addButton({ title: 'Refresh bodies' }).on('click', rebuildBodyControls);
  rebuildBodyControls();

  const findPlayerController = () => {
    for (const go of game.objects) {
      const ctrl = go.components.find((c): c is PlayerController => c instanceof PlayerController);
      if (ctrl) return ctrl;
    }
    return null;
  };

  const playerFolder = pane.addFolder({ title: 'Player Controller', expanded: false });
  const playerState = { speed: 8, jumpStrength: 4.5 };
  const speedBinding = playerFolder
    .addBinding(playerState, 'speed', { min: 0, max: 30, step: 0.1, label: 'Speed' })
    .on('change', (ev: any) => {
      const ctrl = findPlayerController();
      if (ctrl) ctrl.speed = ev.value;
    });
  const jumpBinding = playerFolder
    .addBinding(playerState, 'jumpStrength', { min: 0, max: 20, step: 0.1, label: 'Jump' })
    .on('change', (ev: any) => {
      const ctrl = findPlayerController();
      if (ctrl) ctrl.jumpStrength = ev.value;
    });

  const selectionFolder = pane.addFolder({ title: 'Selection Components', expanded: false });
  type SelectionBinding = {
    dispose: () => void;
    refresh?: () => void;
  };
  let selectionBindings: SelectionBinding[] = [];

  const clearSelectionBindings = () => {
    for (const binding of selectionBindings) {
      binding.dispose();
    }
    selectionBindings = [];
  };

  const rebuildSelectionBindings = (selected?: GameObject) => {
    clearSelectionBindings();
    const children = (selectionFolder as any).children as any[] | undefined;
    children?.slice().forEach((child: any) => child.dispose());
    if (!selected) {
      selectionFolder.title = 'Selection Components';
      return;
    }
    selectionFolder.title = `Selection • ${selected.name ?? 'GameObject'}`;

    const ctrl = selected.components.find(
      (c): c is PlayerController => c instanceof PlayerController,
    );
    if (ctrl) {
      const state = { speed: ctrl.speed, jumpStrength: ctrl.jumpStrength };
      const folder = selectionFolder.addFolder({ title: 'Player Controller', expanded: true });
      const sBinding = folder
        .addBinding(state, 'speed', { min: 0, max: 30, step: 0.1, label: 'Speed' })
        .on('change', (ev: any) => {
          ctrl.speed = ev.value;
        });
      const jBinding = folder
        .addBinding(state, 'jumpStrength', { min: 0, max: 20, step: 0.1, label: 'Jump' })
        .on('change', (ev: any) => {
          ctrl.jumpStrength = ev.value;
        });
      selectionBindings.push({ dispose: () => folder.dispose() });
      selectionBindings.push({ dispose: () => sBinding.dispose(), refresh: () => sBinding.refresh() });
      selectionBindings.push({ dispose: () => jBinding.dispose(), refresh: () => jBinding.refresh() });
      selectionBindings.push({
        dispose: () => {},
        refresh: () => {
          if (Math.abs(state.speed - ctrl.speed) > 1e-3) {
            state.speed = ctrl.speed;
            sBinding.refresh();
          }
          if (Math.abs(state.jumpStrength - ctrl.jumpStrength) > 1e-3) {
            state.jumpStrength = ctrl.jumpStrength;
            jBinding.refresh();
          }
        },
      });
    }
  };

  if (options.editor) {
    const disposeSelection = options.editor.onSelectionChanged((go) => {
      rebuildSelectionBindings(go);
    });
    rebuildSelectionBindings(options.editor.selected);
    pane.on('dispose', disposeSelection);
  }

  const refresh = () => {
    const currentBodies = new Set(game.objects.map((o) => o.body).filter(Boolean));
    let needsRebuild = false;
    for (const entry of bodyControls) {
      if (!currentBodies.has(entry.body)) {
        needsRebuild = true;
        continue;
      }
      if (Math.abs(entry.state.x - entry.body.position.x) > 1e-3) {
        entry.state.x = entry.body.position.x;
        entry.bindings[0].refresh();
      }
      if (Math.abs(entry.state.y - entry.body.position.y) > 1e-3) {
        entry.state.y = entry.body.position.y;
        entry.bindings[1].refresh();
      }
      if (Math.abs(entry.state.z - entry.body.position.z) > 1e-3) {
        entry.state.z = entry.body.position.z;
        entry.bindings[2].refresh();
      }
    }
    if (needsRebuild) rebuildBodyControls();

    const ctrl = findPlayerController();
    if (ctrl) {
      if (Math.abs(playerState.speed - ctrl.speed) > 1e-3) {
        playerState.speed = ctrl.speed;
        speedBinding.refresh();
      }
      if (Math.abs(playerState.jumpStrength - ctrl.jumpStrength) > 1e-3) {
        playerState.jumpStrength = ctrl.jumpStrength;
        jumpBinding.refresh();
      }
    }

    for (const binding of selectionBindings) {
      binding.refresh?.();
    }
  };

  const interval = setInterval(refresh, 200);
  pane.on('dispose', () => {
    clearInterval(interval);
    disposeBodyControls();
    clearSelectionBindings();
    closeBtn.remove();
    showBtn.remove();
    host.remove();
  });

  return pane;
}
