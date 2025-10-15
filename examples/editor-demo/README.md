# Editor Demo

## Schnellstart

1. Im Projektstamm `npm install` ausführen (einmalig).
2. Entwicklungsserver starten: `npm run dev`.
3. Browser öffnen und `http://localhost:5173/` laden. Die Demo lädt automatisch die
   bereitgestellte `scene.json`.

Die Szene nutzt ausschließlich eingebaute Prefabs (`DemoGround`, `DemoPlayer`,
`PickupSphere`) und funktioniert daher ohne zusätzliche GLB-Assets. Eigene Modelle
kannst du später einfach in `models/` ergänzen.

## Steuerung

- Klicke auf ein Objekt, um es auszuwählen.
- Verwende **T** (oder **1**) zum Verschieben, **R** (oder **2**) zum Drehen und **S** (oder **3**) zum Skalieren.
- Ziehe an den Achsen des Gizmos, um die ausgewählte Transformation anzuwenden.
- Drücke **Entf**, um das ausgewählte Objekt aus der Szene zu entfernen.

Lege deine `.glb`- oder `.gltf`-Dateien in `examples/editor-demo/models/` ab, damit sie automatisch geladen werden. Wenn du eine eigene Szene speichern möchtest, ersetze einfach die mitgelieferte `scene.json` durch deine Variante.
