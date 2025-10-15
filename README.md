# Neuro Engine (Modular)

## Entwicklung & Demo starten

1. Abhängigkeiten installieren: `npm install`
2. Editor-Demo starten: `npm run dev`
3. Browser öffnen und `http://localhost:5173/` aufrufen. Die mitgelieferte `scene.json`
   lädt sofort das Beispiel mit Spieler, Boden und Pickup-Sphären.

### Szenen exportieren & importieren

- Im Editor findest du oben rechts ein Panel „Szene speichern / laden“. Darüber kannst du
  die aktuelle Szene als `scene.json` herunterladen, in die Zwischenablage kopieren oder
  eine JSON-Datei/URL laden.
- Die gespeicherte Datei kannst du direkt wieder unter `examples/editor-demo/scene.json`
  ablegen oder im eigenen Projekt via `loadScene(game, data)` verwenden (`src/assets/scene`).

### Weitere Skripte

- Bibliothek bauen: `npm run build`
- Demo als Production-Build bauen: `npm run build:demo`
- Production-Build lokal ansehen: `npm run preview`

### Projektstruktur (Auszug)

- `src/` enthält die Engine (core/ecs/physics/components/editor/...)
- `examples/editor-demo/` zeigt SceneGraph-Editor, Kamera-Follow, Physik, Audio-Mixer etc.
