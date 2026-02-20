# Neuro Engine

Eine modulare 3D-Game-Engine auf Basis von **Three.js** (Rendering) und **cannon-es** (Physik), inklusive leichtgewichtigem ECS-Ansatz, Komponenten-System, Audio-Utilities und einem integrierten Editor-Demo.

## Inhalt

- [Überblick](#überblick)
- [Features](#features)
- [Technologie-Stack](#technologie-stack)
- [Voraussetzungen](#voraussetzungen)
- [Schnellstart](#schnellstart)
- [NPM-Skripte](#npm-skripte)
- [Projektstruktur](#projektstruktur)
- [Editor-Demo nutzen](#editor-demo-nutzen)
- [Eigene Modelle hinzufügen](#eigene-modelle-hinzufügen)
- [Mini-API-Überblick](#mini-api-überblick)
- [Build & Distribution](#build--distribution)
- [Fehlerbehebung](#fehlerbehebung)
- [Ausblick](#ausblick)

## Überblick

Die Engine ist als Bibliothek und Demo-Projekt aufgebaut:

- **`src/`** enthält die Engine-Module (Core, ECS, Physik, Komponenten, Assets, UI, Editor).
- **`examples/editor-demo/`** enthält eine ausführbare Beispielanwendung mit automatisch geladenen GLB/GLTF-Modellen und Editor-Funktionalitäten.

Ziel ist ein gut erweiterbares Fundament für 3D-Prototyping, Gameplay-Experimente und Tooling im Browser.

## Features

- **Rendering mit Three.js** inklusive Schatten, Tone Mapping und OrbitControls.
- **Physik mit cannon-es** (feste Zeitschritte, Material-/Kontaktkonfiguration).
- **Entity-/Component-Ansatz** über `GameObject` + Komponenten.
- **EventBus** für lose Kopplung von Systemen.
- **Asset-Utilities** für GLTF/GLB und Szenen-/Prefab-Workflows.
- **Audio-Bausteine** (Mixer + Audio-Komponenten).
- **Editor-Anbindung** zur Selektion/Manipulation im Demo.
- **Auto-Discovery von Modellen** im Demo über `import.meta.glob(...)`.

## Technologie-Stack

- [Three.js](https://threejs.org/) – Rendering, Kamera, Controls, Assets
- [cannon-es](https://github.com/pmndrs/cannon-es) – Physik
- [Vite](https://vitejs.dev/) – Dev-Server & Build
- [TypeScript](https://www.typescriptlang.org/) – Typisierte Entwicklung
- [tweakpane](https://cocopon.github.io/tweakpane/) – Debug-/UI-Werkzeuge

## Voraussetzungen

- **Node.js** (empfohlen: aktuelle LTS-Version)
- **npm**

## Schnellstart

```bash
npm install
npm run dev
```

Danach ist die Demo über den von Vite ausgegebenen lokalen URL erreichbar.

## NPM-Skripte

| Skript | Beschreibung |
|---|---|
| `npm run dev` | Startet den Vite-Dev-Server für `examples/editor-demo`. |
| `npm run build:lib` | Baut die Engine als Bibliothek via `vite.lib.config.ts`. |
| `npm run build:demo` | Baut die Demo-Anwendung als statische Assets. |
| `npm run build` | Alias für `build:lib`. |
| `npm run preview` | Vorschau eines gebauten Demo-Bundles via Vite Preview. |

## Projektstruktur

```text
.
├─ src/
│  ├─ core/         # Game-Laufzeit, EventBus
│  ├─ ecs/          # GameObject/Component-Basis
│  ├─ physics/      # Physik-Welt & Hilfsfunktionen
│  ├─ components/   # Wiederverwendbare Gameplay-Komponenten
│  ├─ assets/       # Loader, Prefab-/Scene-Utilities
│  ├─ audio/        # AudioMixer, AudioComponent
│  ├─ editor/       # Editor-Logik
│  └─ ui/           # Debug/HUD/Pause-Menü
├─ examples/
│  └─ editor-demo/  # Beispielprojekt mit Modell-Import & Editor
├─ models/          # Zusätzliche Modelldateien (optional)
└─ README.md
```

## Editor-Demo nutzen

Die Demo lädt Modelle aus mehreren bekannten Pfaden:

- `examples/editor-demo/models/*.{glb,gltf}`
- `examples/editor-demo/model/*.{glb,gltf}`
- `models/*.{glb,gltf}`

### Steuerung (Editor)

- Objekt anklicken → auswählen
- **T** oder **1** → Verschieben
- **R** oder **2** → Rotieren
- **S** oder **3** → Skalieren
- **Entf** → Ausgewähltes Objekt löschen

### Laufzeitverhalten der Demo

- Das **erste gefundene Modell** wird als „Player“ geladen.
- Danach werden Komponenten wie Ground-Sensor, Player-Controller und Animations-State-Machine angebunden.
- Die Kamera wird auf das Objekt eingerahmt und per Follow-Komponente nachgeführt.
- Weitere Modelle werden als statische Deko versetzt in der Szene platziert.

## Eigene Modelle hinzufügen

1. Lege `.glb`- oder `.gltf`-Dateien in einen der oben genannten Modell-Ordner.
2. Starte die Demo neu (`npm run dev`), falls der Dev-Server die neuen Assets nicht sofort erkennt.
3. Das erste gefundene Asset wird als Player behandelt; sortiere Dateinamen ggf. entsprechend deiner gewünschten Priorität.

## Mini-API-Überblick

Die Library exportiert zentrale Klassen und Hilfen über `src/index.ts`, u. a.:

- `Game`, `EventBus`
- `Component`, `GameObject`
- `World` + Physik-Utilities
- Gameplay-Komponenten (`PlayerController`, `CameraFollow`, ...)
- Asset-Loader (`gltf`, `scene`, `prefab`)
- `Editor`, `DebugUI`, `Hud`, `PauseMenu`

### Minimalbeispiel

```ts
import { Game, GameObject } from '@neuro/engine';

const container = document.getElementById('app')!;
const game = new Game(container);

const object = new GameObject({ name: 'MyObject' });
game.add(object);
```

## Build & Distribution

### Engine-Bibliothek bauen

```bash
npm run build:lib
```

### Demo bauen

```bash
npm run build:demo
```

### Demo-Build lokal prüfen

```bash
npm run preview
```

## Fehlerbehebung

- **Modelle werden nicht geladen**
  - Prüfe Dateiendung (`.glb` / `.gltf`) und Ablagepfad.
  - Beachte Groß-/Kleinschreibung in Dateinamen und Ordnern.

- **Leere Szene / schwarzer Screen**
  - Browser-Konsole auf Loader- oder Netzwerkfehler prüfen.
  - Sicherstellen, dass `#app` im HTML vorhanden ist.

- **Langsame Performance**
  - Anzahl und Polygonzahl der Modelle reduzieren.
  - Schattenqualität bzw. Lichtanzahl testweise verringern.

## Ausblick

Mögliche nächste Schritte für das Projekt:

- stabilere Serialisierung/Deserialisierung für Szenen
- ausgebautes Prefab- und Asset-Management
- mehr Editor-Werkzeuge (Snapping, Multi-Select, Undo/Redo)
- erweiterte Gameplay-Beispielsysteme (KI, Trigger, Missionslogik)

---

Wenn du möchtest, kann ich als Nächstes noch eine **englische README-Version** ergänzen oder ein **„Contributing“-Kapitel** (Code-Style, Commits, Branching, PR-Checkliste) hinzufügen.
