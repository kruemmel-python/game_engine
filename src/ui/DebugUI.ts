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
  const pane = new Pane({ title: 'Debug' });

  const getCameraFollow = () => {
    const rig = options.getCameraRig?.();
    const components = rig?.components ?? [];
    return components.find((c: any) => c.constructor?.name === 'CameraFollow');
  };

  const cameraFolder = pane.addFolder({ title: 'Camera Follow', expanded: true });
  const cameraState = { distance: 3.5, height: 1.4 };
  cameraFolder
    .addBinding(cameraState, 'distance', { min: 1, max: 10, step: 0.1, label: 'Distance' })
    .on('change', (ev) => {
      const follow: any = getCameraFollow();
      if (follow) follow.distance = ev.value;
    });
  cameraFolder
    .addBinding(cameraState, 'height', { min: 0, max: 5, step: 0.05, label: 'Height' })
    .on('change', (ev) => {
      const follow: any = getCameraFollow();
      if (follow) follow.height = ev.value;
    });

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
  });

  return pane;
}
