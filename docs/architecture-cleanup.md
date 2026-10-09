# MandelFlight: Architecture Cleanup

**Stand:** 2026-10-09  
**Zweck:** Wiederauffindbare Bestandsaufnahme und Refactoring-Plan. Dieses
Dokument beschreibt ein Zielbild; es beauftragt oder dokumentiert keine
bereits ausgeführten Refactorings. Funktionale Änderungen sind ausdrücklich
nicht Teil des Ziels.

## Kurzfassung

Die Anwendung ist ein Vite-Multipage-Projekt. Der Fractal-Prototyp liegt
überwiegend in `src/projekte/fractal-demo`; dort befinden sich Renderer,
Audio, Modulation, Presets, Auth, UI, Shader, Tests und WASM-Dateien. Eine
eigene Unterstruktur existiert vor allem für `ui` und `colormap`.

Die wichtigsten Risiken liegen an den Grenzen zwischen Komponenten:

- [main.js](../src/projekte/fractal-demo/main.js) koordiniert zu viele
  Features und enthält neben Initialisierung auch Modulationsauswertung,
  Audio-Anschluss, Preset- und Fullscreen-Verknüpfungen.
- [presets.js](../src/projekte/fractal-demo/presets.js) mischt
  Bibliotheks-UI, Aktionen, Auth-/Profilstatus und Legacy-Import.
- Die Auth-Session wird in der Preset-Oberfläche verwaltet, obwohl OAuth-Aufrufe
  bereits in [community-auth.js](../src/projekte/fractal-demo/community-auth.js)
  liegen.
- [modulation.js](../src/projekte/fractal-demo/modulation.js) vereint
  Quelltypen, Transformations-Registry, Fabriken und Parameterein-/ausgabe;
  die Modulationsevaluation liegt dagegen in `main.js`.
- [ui/mod-overlay.js](../src/projekte/fractal-demo/ui/mod-overlay.js) und
  [ui/dialogs.js](../src/projekte/fractal-demo/ui/dialogs.js) greifen direkt
  auf globale DOM-Elemente und/oder globalen Knob-Zustand zu.
- [fractal.css](../src/projekte/fractal-demo/fractal.css) hat rund 815 Zeilen
  für zahlreiche UI-Bereiche.
- Die zwei App-Einstiegsseiten enthalten weitgehend dupliziertes HTML.

Empfehlung: keine neue Framework-Schicht einführen und keinen Großumbau in
einem Schritt durchführen. Erst klare Import- und Zustandsgrenzen schaffen,
dann in kleinen, testsicheren Gruppen Dateien verschieben.

## Bestandsaufnahme

| Bereich | Dateien und Befund |
|---|---|
| App-Start | [main.js](../src/projekte/fractal-demo/main.js), ca. 341 Zeilen. Initialisiert WebGPU, Renderer, Colormap, Audio, Knobs, Modulation, Presets, Problemberichte und Fullscreen-Kommunikation. |
| Fractal Engine | [fractal-renderer.js](../src/projekte/fractal-demo/fractal-renderer.js), ca. 218 Zeilen, enthält GPU-Ressourcen und eingebetteten WGSL-Code. Navigation liegt separat in [fractal-navigation.js](../src/projekte/fractal-demo/fractal-navigation.js). |
| Colormap | [colormap/](../src/projekte/fractal-demo/colormap) ist bereits fachlich gruppiert: GPU-Code, Parameter und WGSL-Shader. |
| Modulation | [modulation.js](../src/projekte/fractal-demo/modulation.js), ca. 235 Zeilen; [knob-state.js](../src/projekte/fractal-demo/knob-state.js) enthält Zustand und Modulationsserialisierung. Die Evaluation steht in `main.js`. |
| Audio | [audio-input.js](../src/projekte/fractal-demo/audio-input.js) verbindet WebAudio, Worklet und WASM; [audio-updates.js](../src/projekte/fractal-demo/audio-updates.js) taktet Updates; [beat-divisions.js](../src/projekte/fractal-demo/beat-divisions.js) enthält Beat-Zeitbasis. |
| Presets | [presets.js](../src/projekte/fractal-demo/presets.js), ca. 381 Zeilen. Formatlogik ist in [preset-format.js](../src/projekte/fractal-demo/preset-format.js), Supabase-Zugriffe in [community-store.js](../src/projekte/fractal-demo/community-store.js). |
| Auth | [community-auth.js](../src/projekte/fractal-demo/community-auth.js) kapselt OAuth-Funktionen; [supabase-client.js](../src/projekte/fractal-demo/supabase-client.js) erzeugt den Client. Auth-Session, Profilabfrage und Auth-UI liegen in `presets.js`. |
| Problemberichte | [problem-report.js](../src/projekte/fractal-demo/problem-report.js) enthält Formularverhalten, Turnstile-Laden/-Verifikation und Meldungsmetadaten. `submitProblem` ist derzeit Teil des Preset-orientierten `community-store.js`. |
| Overlay-/UI | [ui/](../src/projekte/fractal-demo/ui) gruppiert einige Komponenten. Das Modulations-Overlay koppelt UI direkt an globale Knobs und DOM-IDs. |
| CSS/HTML | [fractal.css](../src/projekte/fractal-demo/fractal.css), ca. 815 Zeilen. `index.html` im Repository-Root und [fractal-demo/index.html](../src/projekte/fractal-demo/index.html) enthalten weitgehend doppelte App-Markups. |
| WASM | [modcore/src/lib.rs](../src/projekte/fractal-demo/modcore/src/lib.rs) ist Rust-Quelle. [modcore.js](../src/projekte/fractal-demo/modcore.js) und `modcore/pkg/modcore.js` haben aktuell identischen Inhalt; [build.ps1](../src/projekte/fractal-demo/build.ps1) kopiert die generierten Artefakte. Die Runtime-WASM-Datei ist ebenfalls im Projektverzeichnis. |
| Tests | Vorhandene Tests decken Audio-Taktung, Modulation, Preset-Formate, Navigation und Einstiegseiten ab. Gute Basis für schrittweises Verschieben. |

Größen sind Orientierung und kein mechanisches Split-Kriterium. Kleine Module
können durch Seiteneffekte schwieriger zu testen sein als größere, klar
abgegrenzte Einheiten.

## Zielarchitektur

Das folgende Zielbild trennt Features und technische Querschnittsdienste.
Es ist kein Auftrag, alle Verzeichnisse sofort anzulegen.

```text
src/
  app/
    fractal-demo/
      editor-entry.js
      fullscreen-entry.js
      create-editor-app.js

  features/
    fractal-engine/
      renderer/
        fractal-renderer.js
      navigation/
        fractal-navigation.js
      shaders/
        fractal.wgsl
      model/
        fractal-view.js

    colormap/
      renderer/
        colormap-gpu.js
      shaders/
        cmap-compute.wgsl
        cmap-render.wgsl
      model/
        params.js
      ui/
        cmap-editor.js
        xlut-editor.js

    modulation/
      engine/
        evaluate-modulations.js
        source-context.js
      model/
        knob-state.js
        modulation-slot.js
      sources/
        registry.js
        audio-sources.js
        clock-sources.js
        generators.js
        processors.js
      transforms/
        registry.js
        linear.js
        power.js
      serialization/
        modulation-codec.js

    audio/
      capture/audio-input.js
      processing/audio-updates.js
      worklet/pcm-processor.js
      timing/beat-divisions.js

    auth/
      session-controller.js
      supabase-auth.js
      ui/auth-controls.js

    presets/
      model/preset-format.js
      application/preset-service.js
      data/supabase-preset-repository.js
      data/local-preset-import.js
      ui/preset-library.js
      ui/preset-card.js

    problem-reports/
      data/supabase-problem-report-repository.js
      application/submit-problem-report.js
      ui/problem-report-form.js

  ui/
    components/
      param-controls.js
      knob-controls.js
      dialogs.js
    overlays/
      modulation/modulation-overlay.js
      presets/preset-overlay.js
      problems/problem-overlay.js
    styles/
      base.css
      components.css

  services/
    supabase/client.js

  shared/
    utils/
      math.js
      dom.js

functions/
  api/
    presets/
    turnstile.js
supabase/
  migrations/
```

`src/app` ist der Composition Root: Dort werden Features mit ihren
Abhängigkeiten verbunden. Feature-Engines kennen weder DOM noch Supabase.
UI/Overlays sprechen über explizite Funktionen und Callbacks mit Feature-
Controllern. Supabase bleibt ein geteilter technischer Client; Abfragen und
fachliche Regeln bleiben beim jeweiligen Feature.

## Konkrete Verschiebungen

| Bestehender Pfad | Ziel | Migrationshinweis |
|---|---|---|
| [main.js](../src/projekte/fractal-demo/main.js) | `src/app/fractal-demo/` plus Feature-Module | Nicht nur umbenennen. Zuerst die Modulationsauswertung und Fullscreen-/Audio-Orchestrierung auslagern, dann einen dünnen Bootstrap behalten. |
| [fractal-renderer.js](../src/projekte/fractal-demo/fractal-renderer.js), [fractal-navigation.js](../src/projekte/fractal-demo/fractal-navigation.js) | `src/features/fractal-engine/renderer` und `navigation` | Als gemeinsame Engine-Grenze erhalten. Renderer-API stabil halten. |
| [colormap/](../src/projekte/fractal-demo/colormap) | `src/features/colormap/` | Schon relativ gut separiert; hauptsächlich Pfadänderung. |
| [modulation.js](../src/projekte/fractal-demo/modulation.js), [knob-state.js](../src/projekte/fractal-demo/knob-state.js) | `src/features/modulation/` | Registry, Modell, Evaluation und Serialisierung beim Umzug entflechten. |
| [audio-input.js](../src/projekte/fractal-demo/audio-input.js), [audio-updates.js](../src/projekte/fractal-demo/audio-updates.js), [pcm-processor.js](../src/projekte/fractal-demo/pcm-processor.js), [beat-divisions.js](../src/projekte/fractal-demo/beat-divisions.js) | `src/features/audio/` | Capture, Worklet, Verarbeitung und Zeitbasis bündeln, ohne Audio-Verhalten zu ändern. |
| [presets.js](../src/projekte/fractal-demo/presets.js), [preset-format.js](../src/projekte/fractal-demo/preset-format.js) | `src/features/presets/` | Formatkern getrennt lassen; Bibliothekscontroller, Karten und lokale Importe schrittweise trennen. |
| [community-store.js](../src/projekte/fractal-demo/community-store.js) | `src/features/presets/data/` plus Problem-Report-Repository | Preset- und Problembericht-Abfragen in ihren jeweiligen Featuregrenzen halten. |
| [community-auth.js](../src/projekte/fractal-demo/community-auth.js) | `src/features/auth/supabase-auth.js` | OAuth-Aufrufe klar von Sessionzustand und UI unterscheiden. |
| [supabase-client.js](../src/projekte/fractal-demo/supabase-client.js) | `src/services/supabase/client.js` | Einen Client beibehalten; keine parallelen Clients pro Feature. |
| [problem-report.js](../src/projekte/fractal-demo/problem-report.js) | `src/features/problem-reports/` | Formular, Turnstile-Anwendungslogik und Datenzugriff separat verantworten lassen. |
| [ui/mod-overlay.js](../src/projekte/fractal-demo/ui/mod-overlay.js), [ui/param-controls.js](../src/projekte/fractal-demo/ui/param-controls.js) | `src/ui/overlays/modulation/` und `src/ui/components/` | Generische Controls von overlay-spezifischer Orchestrierung trennen. |
| [util.js](../src/projekte/fractal-demo/util.js) | `src/shared/utils/` | Nur tatsächlich fachübergreifende Helfer verschieben; Feature-spezifische Helfer beim Feature belassen. |
| [fractal.css](../src/projekte/fractal-demo/fractal.css) | `src/ui/styles/` plus Feature-CSS | Erst nach Stabilisierung der Komponenten aufteilen und visuell prüfen. |

## Refactoring-Plan nach Priorität

### Sofort: Hygiene und Grenzen vorbereiten

1. Eine einfache Abhängigkeitsregel festlegen: UI hängt von Features ab,
   Features nicht von globalem DOM oder App-Bootstrap; Services stellen
   technische Zugriffe bereit, enthalten aber keine UI.
2. Entfernte/alte Stellen aufräumen, aber nur nach Referenzprüfung. Kandidaten
   zur Prüfung sind `updateDisplayName`, `supabaseConfigured`, `ModTransfrom`,
   `sliderMod` und [ui/dialogs.js](../src/projekte/fractal-demo/ui/dialogs.js).
   Erst per Suchlauf bestätigen, dann entfernen.
3. Nicht mehr aktive auskommentierte Prototypblöcke in `main.js` entfernen,
   sofern sie keine bewusst erhaltene Entwicklungsnotiz darstellen.
4. Bestehende Tests behalten und um klare Verträge zwischen Session,
   Preset-Anwendung und Overlay-Ereignissen ergänzen.

### Vor Veröffentlichung: Featuregrenzen etablieren

1. `main.js` zum dünnen Bootstrap machen. Fractal, Colormap, Audio,
   Modulation, Presets und Fullscreen-Kommunikation werden getrennt initialisiert.
2. Session- und Profilstatus in `features/auth` verlagern. Presets konsumieren
   den Auth-Zustand, statt ihn zu verwalten.
3. Preset-UI auf Bibliothekscontroller, Preset-Karten und lokale Legacy-Importe
   aufteilen. `preset-format.js` als Formatkern behalten.
4. Modulationsauswertung aus `main.js` in eine DOM-freie Engine verschieben.
   Das Overlay arbeitet über explizite Abhängigkeiten und Callbacks.
5. `submitProblem` aus `community-store.js` in den Problemberichte-Bereich
   verschieben.
6. Doppelte App-Einstiegsseiten konsolidieren oder Unterschiede explizit
   dokumentieren. Routing, Rewrite-Regeln und Fractal-Demo separat testen.

### Später: gezielte technische Schulden

1. WGSL aus [fractal-renderer.js](../src/projekte/fractal-demo/fractal-renderer.js)
   in Shaderdateien auslagern, nachdem die Renderergrenze stabil ist.
2. [fractal.css](../src/projekte/fractal-demo/fractal.css) nach Komponenten
   und Overlays aufteilen; jede Änderung visuell prüfen.
3. Rust/WASM-Quelle und generierte Artefakte eindeutig ordnen. Bevor Kopien oder
   [modcore/src/libOLD.rs](../src/projekte/fractal-demo/modcore/src/libOLD.rs)
   entfernt werden, klären, welche Dateien Build-Eingaben bzw. benötigte
   Laufzeit-Artefakte sind. Die zwei derzeit identischen `modcore.js`-Dateien
   sind ein konkreter Kandidat für eine einzige Quelle der Wahrheit.
4. Deployment reproduzierbarer machen: [package.json](../package.json) verwendet
   für `deploy` `npx wrangler@4`; GitHub Actions führt denselben Uploadweg
   separat aus. Wrangler-Versionen und Verantwortlichkeiten der beiden Wege
   sollten bewusst festgelegt werden.

## Risiken und Leitplanken

- **Preset-Kompatibilität:** Schema, Legacy-Leser, Knob-Zustand und XLUT sind
  persistierte Datenverträge. Nicht im selben Schritt mit UI oder Pfaden ändern.
- **Auth:** OAuth-Redirect, Sessionwiederherstellung und Sessionwechsel bei
  geöffnetem Preset-Overlay testen.
- **Modulation:** Quellen, Transform-Identitäten und deren Parameter werden
  serialisiert. Engine-Tests vor und nach dem Verschieben ausführen.
- **Overlays:** Fokus, Escape, Dragging, Schließen und Tastatursteuerung testen.
  Kein neues Modul soll beim bloßen Import überraschend globale DOM-Handler
  installieren.
- **Routing:** Root-, Fractal-, Fullscreen- und Function-Plotter-Einstiege sowie
  Vite-Preview und Pages-Rewrites bleiben erhalten.
- **WASM:** Generierte JS/WASM-Dateien nicht entfernen, bevor Build und Runtime
  mit einer klaren Quelle der Wahrheit verifiziert sind.
- **Umfang:** Kein Framework einführen und keine umfassende Umbenennung in einem
  Commit. Pro Schritt eine fachliche Grenze verschieben, Tests und Build laufen
  lassen, dann visuell prüfen.

## Empfohlene Reihenfolge

1. Unbenutzte Kandidaten und Prototypreste nach Referenzsuche prüfen.
2. Audio- und Fractal-Module gruppieren und Imports korrigieren.
3. Auth-Session von der Preset-UI trennen.
4. Problemberichte aus dem Community-Preset-Store lösen.
5. Preset-Controller und Modulations-Evaluator in kleinere Module teilen.
6. Overlay-Abhängigkeiten explizit machen.
7. Doppelte HTML-Einstiege und CSS-Struktur separat angehen.
8. WASM-Artefakte und Deploypfade zuletzt bereinigen.

Nach jedem Schritt: `npm test`, `npm run build`, `git diff --check`; für
Einstiegsseiten, Overlays und CSS zusätzlich einen kurzen Browser-Check.
