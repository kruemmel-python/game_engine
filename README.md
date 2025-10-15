# Neuro Engine (Modular)

## Entwicklung & Demo starten

1. Abhängigkeiten installieren: `npm install`
2. Editor-Demo starten: `npm run dev`
3. Browser öffnen und `http://localhost:5173/` aufrufen. Die mitgelieferte `scene.json`
   lädt sofort das Beispiel mit Spieler, Boden und Pickup-Sphären.

### Weitere Skripte

- Bibliothek bauen: `npm run build`
- Demo als Production-Build bauen: `npm run build:demo`
- Production-Build lokal ansehen: `npm run preview`

### Projektstruktur (Auszug)

- `src/` enthält die Engine (core/ecs/physics/components/editor/...)
- `examples/editor-demo/` zeigt SceneGraph-Editor, Kamera-Follow, Physik, Audio-Mixer etc.
