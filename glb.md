# GLB-Richtlinien für die Game Engine

Diese Dokumentation beschreibt, wie GLB- bzw. GLTF-Modelle für den Einsatz mit der Game Engine vorbereitet werden sollten. Sie fasst die Erwartungen des Editors und der Laufzeit zusammen, zeigt den Umgang mit Animationen und liefert konkrete Beispielstrukturen.

## Grundlegende Annahmen der Engine

- **Maße & Skalierung** – Beim Laden wird das Modell automatisch so skaliert, dass seine größte Ausdehnung exakt zwei Einheiten beträgt. Ausgangspunkte nahe des Ursprungs erleichtern die automatische Kamerapositionierung und Physik-Berechnung.【F:engine.html†L497-L516】
- **Koordinatensystem** – Die Engine verwendet Three.js mit Y-Achse nach oben. Bodenflächen werden als XZ-Ebene interpretiert; ein aufrecht stehendes Modell sollte daher die Y-Achse als vertikale Achse nutzen.【F:src/core/Game.ts†L37-L90】
- **Pivot & Ursprung** – Physik-Bodies werden aus der Axis-Aligned Bounding Box (AABB) des gesamten Modells erzeugt. Liegt der Pivotpunkt nicht sinnvoll (z. B. deutlich unterhalb der Geometrie), verschiebt sich der Kasten. Positioniere die Geometrie so, dass der Ursprung im Bodenkontaktpunkt oder Mittelpunkt liegt.【F:engine.html†L432-L480】
- **Materialien & Schatten** – Alle Meshes werden automatisch für das Werfen und Empfangen von Schatten konfiguriert. Verwende PBR-Materialien mit BaseColor, Metallic/Roughness und optional Normal Maps für optimale Ergebnisse.【F:engine.html†L498-L505】

## Physik-Integration

Beim Import erzeugt die Engine einen physikalischen Body:

1. Falls `exact: true` gesetzt ist, werden entweder konvexe Polygone (für dynamische Objekte) oder Triangulationsnetze (für statische Objekte) aus der Weltgeometrie gebaut.【F:engine.html†L432-L468】
2. Andernfalls entsteht ein Box-Collider aus der AABB des Modells. Die Höhe bestimmt gleichzeitig die initiale Y-Position des Bodies, damit er nicht im Boden versinkt.【F:engine.html†L471-L477】
3. Für dynamische Assets empfiehlt es sich, die Bounding Box bereits im DCC-Tool zu optimieren (z. B. durch ein separates Collider-Mesh), damit Größenverhältnisse und Schwerpunkt korrekt ausfallen.

### Empfohlene Vorbereitungsschritte

- **Skalierung anwenden**: Friere Skalierung/Rotation vor dem Export ein, damit der automatische 2-Einheiten-Scale keine Überraschungen verursacht.
- **Transformations-Hierarchie bereinigen**: Entferne leere Dummy-Nodes oder Helper, die weit vom Ursprung entfernt liegen. Sie fließen in die Bounding Box ein und beeinflussen die Physik.
- **Collider-Varianten**: Für große Landschaften kann ein separates vereinfachtes Mesh in einer eigenen GLB-Datei mit `exact: true` genutzt werden, während spielrelevante Objekte als dynamische Prefabs mit `exact: false` geladen werden.

## Animationen

Die Engine erkennt Animationen automatisch und stellt sie in der Editor-GUI zur Auswahl. Zusätzlich existiert eine optionale `AnimationStateMachineComponent`, die anhand der Clip-Namen zwischen Idle-, Walk- und Jump-Animationen wechselt.【F:engine.html†L518-L537】【F:src/components/AnimationSM.ts†L1-L29】

### Anforderungen an animierte GLB-Dateien

- **Skelett & Skinning** – Verwende ein einheitliches Skelett pro Mesh. Three.js unterstützt bis zu vier Bone-Weights pro Vertex; halte dich an diese Grenze.
- **Clip-Namen** – Benenne Animationen eindeutig. Die State Machine sucht nach Teilstrings `idle`, `walk`, `run` und `jump`, jeweils in Kleinbuchstaben, um automatisch passende Clips zuzuordnen.【F:src/components/AnimationSM.ts†L10-L21】
- **Loop-Einstellungen** – Standardmäßig werden Clips geloopt abgespielt. Willst du einmalige Aktionen (z. B. Türen) darstellen, füge sie hinzu und triggert sie später über eigene Komponenten oder das Debug UI.
- **Mehrere Aktionen** – Beim Import wird der erste Clip automatisch gestartet. Über das Dropdown `animations` im Editor kannst du einen anderen Clip auswählen oder für Testzwecke wechseln.【F:engine.html†L518-L531】

### Beispiel: Animierter Charakter

```text
MyCharacter.glb
└─ Scene
   ├─ Armature (Bone-Hierarchie)
   │  └─ ... (Bones)
   ├─ BodyMesh (SkinnedMesh, verweist auf Armature)
   └─ MeshCollider (optional, versteckt; dient nur als Bounding-Hilfe)

Animation Clips
- Idle
- Walk
- Jump
```

In Blender bedeutet das:

1. Charakter aufrecht entlang der Y-Achse ausrichten.
2. Action Editor: Separate Actions für Idle/Walk/Jump anlegen und vor dem Export `Stash` oder `NLA` aktivieren.
3. Beim Export `glTF Binary (.glb)` wählen, `Apply Modifiers`, `Apply Transform` und `Animation -> Always Sample Animations` aktivieren.
4. Optional ein unsichtbares Collider-Objekt als Kind des Armature-Root hinzufügen (Layer ausblenden), um eine saubere Bounding Box zu garantieren.

## Beispiel: Statisches Requisit

```text
Crate.glb
└─ Scene
   └─ Crate (Mesh, Ursprung am Bodenmittelpunkt)
      └─ (Material: PBR mit BaseColor, Roughness 0.5)
```

- Kein Skelett notwendig.
- Mit `exact: false` erhält die Kiste automatisch einen Box-Collider, der exakt um das Mesh passt.【F:engine.html†L471-L474】
- Wird die Kiste als dynamisches Objekt geladen (`dynamic: true`), ergänzt der Editor automatisch GroundSensor- und PlayerController-Komponenten, sofern gewünscht.【F:engine.html†L532-L537】

## Integration in die Engine

### Laden im Editor

Lege die GLB-Datei unter `examples/editor-demo/models/` ab. Der Editor lädt alle dort gefundenen Dateien und stellt sie im Modell-Picker bereit. Beim Import werden Kameraausrichtung, Physik und Animation automatisch angepasst.【F:examples/editor-demo/README.md†L10-L25】【F:engine.html†L497-L537】

### Laden im Spielcode

```ts
import { Game } from './core/Game';

const gltf = await game.loadGLB('assets/models/MyCharacter.glb', {
  dynamic: true,      // erzeugt Kinematik & Player-Komponenten
  exact: false        // nutzt die Bounding Box als Collider
});
```

- Verwende `dynamic: true`, wenn das Objekt aktiv durch Physik bewegt werden soll.
- Setze `exact: true`, wenn ein präziser Collider notwendig ist (z. B. bei verwinkelten Höhlen). Beachte, dass konvexe/triangulierte Bodies mehr Performance benötigen.【F:engine.html†L432-L468】

## Troubleshooting

| Problem | Ursache | Lösung |
| --- | --- | --- |
| Modell ist winzig oder gigantisch | Unterschiedliche Einheit im DCC | Skalierung im DCC anwenden; die Engine skaliert zwar auf 2 Einheiten, aber falsche Pivot-Lage kann zu Versatz führen.【F:engine.html†L497-L516】 |
| Collider sitzt nicht korrekt | Entfernte Dummy-Nodes oder unsichtbare Helfer | Hierarchie säubern, Collider-Hilfsobjekte nahe am Mesh halten.【F:engine.html†L432-L477】 |
| Animation läuft nicht | Keine Clips oder Namen nicht eindeutig | Prüfen, ob Aktionen exportiert wurden und ob die Clipnamen `idle/walk/run/jump` enthalten, falls die State Machine genutzt wird.【F:engine.html†L518-L537】【F:src/components/AnimationSM.ts†L10-L21】 |
| Schatten wirken falsch | Normale oder Roughness fehlen | PBR-Texturen im DCC prüfen; alle Meshes werfen/empfangen Schatten automatisch.【F:engine.html†L497-L504】 |

Mit diesen Richtlinien lassen sich GLB-Dateien zuverlässig vorbereiten, sodass sie im Editor sofort korrekt dargestellt, physikalisch simuliert und animiert werden.
