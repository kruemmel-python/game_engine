# Neuro Engine (Modular)

Dev: `npm i` then `npm run dev`  
Build library: `npm run build`

- `src/` contains the engine (core/ecs/physics/components/editor/...)
- `examples/editor-demo` shows SceneGraph editor, camera follow, physics, audio mixer, etc.

## Editor Feature Highlights

The editor now mirrors the modular workflow from tools like Unreal Engine:

- **Szenenverwaltung & Objektorganisation** via `EditorSceneManager` (hierarchies, Ordner, Fokus).
- **Inspector & Eigenschaften-Management** durch `EditorInspector` (Transforms, Komponenten, Properties).
- **Asset- und Ressourcenverwaltung** über den `EditorAssetManager` mit Loader-Caching.
- **Navigation, Kamera & Editor-Werkzeuge** dank `EditorNavigationTools` für Bookmarks und Achsenausrichtung.
- **Physik, Licht & Rendering** konfigurierbar mit `EditorEnvironmentTools`.
- **Gameplay & Simulation** steuerbar durch den `EditorSimulationController` (Play/Pause/Step/Reset).
- **UI & Editor-Komfort** mittels `EditorUIComfort` (Overlay, Snap-Settings, Grid-Toggle).
- **Debugging, Analyse & Tools** in `EditorDebugTools` (Wireframe, Hierarchie-Dumps, Frame-Captures).
- **Kollaboration & Daten** über den `EditorCollaborationHub` (BroadcastChannel, LocalStorage, Share-Codes).
