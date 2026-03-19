import type { Game } from '../core/Game';
import { SceneManager } from './SceneManager';
import { InspectorController, InspectorRegistry } from './Inspector';
import { ViewportTools } from './ViewportTools';
import { AssetManager } from '../assets/AssetManager';
import { EnvironmentManager } from '../physics/EnvironmentManager';
import { SimulationManager } from '../core/SimulationManager';
import { EditorComfortUI } from '../ui/EditorComfortUI';
import { DebugTools } from '../core/DebugTools';
import { CollaborationHub } from '../core/CollaborationHub';

export class EditorWorkbench {
  readonly scenes: SceneManager;
  readonly inspectorRegistry: InspectorRegistry;
  readonly inspector: InspectorController;
  readonly viewport: ViewportTools;
  readonly assets: AssetManager;
  readonly environment: EnvironmentManager;
  readonly simulation: SimulationManager;
  readonly comfort: EditorComfortUI;
  readonly debug: DebugTools;
  readonly collaboration: CollaborationHub;

  constructor(public readonly game: Game) {
    this.scenes = new SceneManager(game);
    this.scenes.createScene('Main Scene');
    this.inspectorRegistry = new InspectorRegistry();
    this.inspector = new InspectorController(game, this.inspectorRegistry);
    this.viewport = new ViewportTools(game);
    this.assets = new AssetManager(game);
    this.environment = new EnvironmentManager(game);
    this.simulation = new SimulationManager(game);
    this.comfort = new EditorComfortUI();
    this.debug = new DebugTools(game);
    this.collaboration = new CollaborationHub(game);

    this.hookGameLifecycle();
    this.registerExistingObjects();
    this.game.events.on<{ dt: number; now: number }>('post-update', ({ dt }) => {
      if (!this.game.paused) {
        this.simulation.run(dt);
      }
    });
  }

  private hookGameLifecycle() {
    const originalAdd = this.game.add.bind(this.game);
    this.game.add = (go) => {
      originalAdd(go);
      this.scenes.registerObject(go);
    };

    const originalRemove = this.game.remove.bind(this.game);
    this.game.remove = (go) => {
      this.scenes.unregisterObject(go);
      originalRemove(go);
    };
  }

  private registerExistingObjects() {
    for (const object of this.game.objects) {
      this.scenes.registerObject(object);
    }
  }
}
