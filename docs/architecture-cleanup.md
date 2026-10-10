# MandelFlight: Architecture Cleanup

**Stand:** 2026-10-09  
**Zweck:** Wiederauffindbare Bestandsaufnahme und Refactoring-Plan. Dieses
Dokument beschreibt das Zielbild und hält bereits ausgeführte Schritte unter
„Fortschritt“ fest. Funktionale Änderungen sind ausdrücklich nicht Teil des
Ziels.

## Aktueller Fokus: Konten und Preset-Verstaendlichkeit

Export ist vorerst zurueckgestellt. Die begonnene, nicht deployte
Export-Vorbereitung wurde zurueckgenommen. Vorrang haben Kontowechsel,
Login-Abschluss und eine eindeutige Trennung von Eigentum und Datenherkunft.

### Analyse des aktuellen Systems

- Fachlicher Inhalt: komplette Visual-Presets. Das neue Format verwendet
  `schemaVersion: 1`, `kind: "visual"` und geometry/color/post; alte v1/v2-
  Formate bleiben lesbar. Formate sind keine zusaetzlichen Nutzerkategorien.
- Supabase: eigene private/oeffentliche Presets und private Community-Kopien.
  Featured ist eine Auszeichnung eines oeffentlichen Presets, kein eigener
  Datentyp. Das Willkommensvisual ist eine separate globale Einstellung.
- Lokaler Browser-Speicher und alte gemeinsame Cloudflare-KV-Presets sind
  Importquellen ohne aktuelle Kontozuordnung. Beide erscheinen momentan unter
  My Presets; dadurch vermittelt die Kategorie faelschlich Eigentum.
- Der Kontohinweis beim GitHub-OAuth ist keine bestaetigte Kontoauswahl.
  Lokales Supabase-Abmelden beendet nicht die GitHub-Browsersession.
- `editingPreset`, Formularinhalte und aktueller Presetbezug werden beim
  Identitaetswechsel nicht explizit zurueckgesetzt. Async-Aktionen brauchen
  einen stabilen Kontobezug und eine Invalidierung bei Identitaetswechsel.
- Die Formularsichtbarkeit wird sowohl vom Kategorie- als auch vom
  Bearbeitungsablauf gesteuert. Speichern und Ueberschreiben verwenden denselben
  Buttontext; `refresh()` loescht zudem Erfolgshinweise.
- Lokale Importe werden anhand gleicher Namen ausgeblendet, obwohl ein Name
  keine Identitaet ist. Suche/Sortierung erfasst die angehaengten Importquellen
  nicht konsistent.

### Ziel fuer die naechste Umsetzung

**Aktualisierte Entscheidung:** Ein GitHub-Login mit Benutzer/A (Standard),
Admin/A und Testbenutzer/B. Nur berechtigte Admins sehen die Modusauswahl.
B ist ein privater Testbestand pro authentifiziertem Admin, kein Fremdkonto.
Serverseitige Workspace-Pruefung ersetzt den unzuverlaessigen GitHub-
Kontohinweis. Alle existierenden Presets bleiben unveraendert in A.
Der Herkunfts-/Importbereich bleibt ein separater nachfolgender Schritt.

1. Aktives Konto mit GitHub-Namen und E-Mail deutlich anzeigen; Anmeldung,
   Abmeldung und Wechsel explizit darstellen. Wechsel erst nach Rueckkehr und
   bestaetigter Session als erfolgreich melden, nicht nach OAuth-Start.
2. Meine Presets ausschliesslich nach `owner_id` des aktiven Kontos anzeigen.
   Browserlokale und gemeinsame alte Cloud-Presets in einen eigenen
   Importbereich mit Herkunftshinweis verschieben.
3. Community und Featured als oeffentliche Bibliothek/kuratierte Auswahl
   kennzeichnen; eigene Karten mit Privat/Oeffentlich markieren.
4. Primaeraktionen: Laden und privat im sichtbaren Konto speichern.
   Kopieren/Importieren, Aktualisieren und Veroeffentlichen klar unterscheiden;
   seltene Aktionen wie Loeschen und Admin-Kuration nachrangig platzieren.
5. Identitaetswechsel invalidiert Listen, Bearbeitungsziel und kontogebundene
   Aktionen. Visualisierung darf erhalten bleiben, aber nicht stillschweigend
   im neuen Konto gespeichert werden.

Abnahme: Ein neuer Nutzer soll binnen zehn Sekunden Konto, Eigentum,
Community-Herkunft und Speicherziel erkennen. Dies erfordert einen echten
Benutzertest; automatisierte Tests allein belegen die Zehn-Sekunden-Vorgabe
nicht. Login und Wechsel mit beiden Konten end-to-end pruefen.

### Spaetere Capability: Export

Keine Export-UI oder weitere Exportimplementierung in diesem Schritt.
Als Architekturvorgabe bleiben vollstaendige, versionierte JSON-Visualdaten
ohne DOM, Editorzustand oder Audio-Geraete bestehen. Live-Renderer und spaeterer
Offline-Renderer sollen denselben Vertrag nutzen; Zeit/Frame-Schritt,
Ausgabeformat und Audioquellen werden von getrennten Hosts bereitgestellt.
Live Canvas Capture und Offline Frame-by-Frame sind zukuenftige Render-Modi.
Video-only, Mikrofon und nutzerfreigegebenes Tab-/System-Audio sind spaetere
Aufnahmeoptionen, keine Preset-Typen. Keine Medienstreams oder Berechtigungen
im Preset speichern. Nutzer stellen Audio bereit und verantworten die Rechte.
Der aktuelle Runtime-Code ist damit noch nicht als offline-faehig zertifiziert.

## Fortschritt

- **2026-10-10:** Random als regulaere Registry-Source mit Distribution,
  Center, Skew, Division und Phase. Beat-Sample-&-Hold verwendet ausschliesslich
  Context-Signale und Context-Zufall; Runtime-Zustand bleibt ausserhalb von
  Presetparametern. Gleichverteilung, begrenzte Normalverteilung und
  U-Verteilung gehen kontinuierlich ineinander ueber. Bestehende Sources
  und UI-Fabriken unveraendert; Glider bleibt zurueckgestellt.

- **2026-10-10:** SourceContext erhaelt explizite Zeit, Signal-Snapshots und
  injizierbaren Zufall. Der Audiohost liefert Signale pro aktivem 40-Hz-Tick;
  Pause erzeugt keine nachzuholenden Schritte. Legacy-Oszillatorgeschwindigkeit
  bleibt bewusst erhalten; bestehende Envelope-/Base-/Punch-Semantik bleibt
  unveraendert. Browserglobale liegen nur im Kompatibilitaetsadapter.
  Random und Glider sind nachfolgende Features, nicht Teil dieses Refactors.

- **2026-10-10:** Audio-Reaktionspause als expliziter Runtime-Schalter in
  [audio-react-control.js](../src/projekte/fractal-demo/audio-react-control.js).
  Button und Space sperren nur automatische Modulationsupdates; manuelle
  Colormap-Aenderungen und Mikrofonanalyse bleiben aktiv. Der bisherige
  wirkungslose Space-Flagpfad ist entfernt. Kein Preset-/Fullscreen-Refactor
  in diesem Schritt; Pause wird nicht im Preset gespeichert.

- **2026-10-10:** Echte Preset-Thumbnails werden beim expliziten Speichern
  synchron aus dem frisch gerenderten Canvas aufgenommen. Die optionale
  JPEG-Metadatenstruktur `thumbnail` bleibt vom Visual-State-Codec getrennt,
  wird lokal und im bestehenden JSON-Payload gespeichert und beim Kopieren
  uebernommen. Listen lesen nur die Thumbnail-Projektion; keine Migration,
  kein Exportmodul und kein Hintergrund-Renderer fuer alte Presets.

- **2026-10-09:** Meine Presets enthalten ausschliesslich den aktiven
  Kontobestand. Der eigene Bereich Auf diesem Geraet bietet lokales Speichern
  ohne Login sowie Laden, Aktualisieren, Loeschen und explizites privates
  Kopieren ins Konto. Speicherziele sind separate Aktionen, keine impliziten
  Login-Fallbacks. Die alten gemeinsamen Cloud-Karten und deren Frontend-
  Datenzugriff sind entfernt; importierte Kopien und KV-Originale bleiben.
  [local-preset-store.js](../src/projekte/fractal-demo/local-preset-store.js)
  kapselt den bestehenden lokalen Speicher inklusive Legacy-Lesbarkeit,
  Kollisionspruefung und expliziten Speicherfehlern.

- **2026-10-09:** Ein GitHub-Login mit explizitem Arbeitsmodus ersetzt den
  bisherigen Kontohinweis. Benutzer/A ist Standard, Admin/A nutzt denselben
  Bestand mit Verwaltungsrechten, Testbenutzer/B ist ein privater Bestand pro
  Admin. Die Migration prueft Berechtigung und Datensatz serverseitig.
  Modus-/Identitaetswechsel invalidieren Listen, Bearbeitungsziele und alte
  Aktionen; Requests halten Modus und erwartete Identitaet fest.
  Erfolgshinweise bleiben nach Listenrefresh sichtbar.
  [Workspace-SQL-Tests](../supabase/tests/workspaces.sql) pruefen RLS und RPCs
  mit Admin- und Nicht-Admin-Identitaeten und rollen Testschreibzugriffe zurueck.

- **2026-10-09:** Die Modulationsauswertung wurde aus `main.js` in
  [modulation-engine.js](../src/projekte/fractal-demo/modulation-engine.js)
  extrahiert. `main.js` ruft die Engine weiterhin an derselben Stelle im
  Audio-Update auf; die Engine mutiert dieselben Knob-Zustände und hat eigene
  Regressionstests. Preset-, Renderer- und UI-Verträge blieben unverändert.
- **2026-10-09:** `submitProblem` wurde aus dem Community-Preset-Store in
  [problem-report-store.js](../src/projekte/fractal-demo/problem-report-store.js)
  verschoben. Die Datenzuordnung und Supabase-Operation bleiben unverändert;
  Preset-Datenzugriff und Problembericht-Datenzugriff sind jetzt getrennt.
- **2026-10-09:** Auth-Session, Profil-/Adminabfrage und deren Race-Schutz liegen
  jetzt in [community-session.js](../src/projekte/fractal-demo/community-session.js).
  Die Preset-UI konsumiert Auth-Snapshots; Problemberichte lesen die Session
  direkt aus dem Sessiondienst.
- **2026-10-09:** Darstellung und DOM-Handler für Login, Logout und den
  Community-Konfigurationshinweis liegen jetzt in
  [community-auth-ui.js](../src/projekte/fractal-demo/community-auth-ui.js).
  Der Preset-Controller erhält weiterhin Auth-Snapshots für Berechtigungen;
  OAuth-Aktionen werden über den App-Bootstrap injiziert.
- **2026-10-09:** Der Preset-Controller importiert keine OAuth-Implementierung
  mehr direkt. [main.js](../src/projekte/fractal-demo/main.js) verbindet die
  Auth-Aktionen mit dem Auth-UI und dem vorhandenen Preset-Fehlerwrapper.
- **2026-10-09:** Community- und lokale Legacy-Preset-Karten werden jetzt in
  [ui/preset-card.js](../src/projekte/fractal-demo/ui/preset-card.js) gerendert.
  Vorschau, Metadaten, Featured-Badge und Statistik sind vom Controller getrennt
  und separat getestet. Aktionshandler, Berechtigungen und Datenzugriff bleiben
  unverändert im Preset-Controller; das Kartenmodul erhält fertige DOM-Aktionen.

## Kurzfassung

Die Anwendung ist ein Vite-Multipage-Projekt. Der Fractal-Prototyp liegt
überwiegend in `src/projekte/fractal-demo`; dort befinden sich Renderer,
Audio, Modulation, Presets, Auth, UI, Shader, Tests und WASM-Dateien. Eine
eigene Unterstruktur existiert vor allem für `ui` und `colormap`.

Die wichtigsten Risiken liegen an den Grenzen zwischen Komponenten:

- [main.js](../src/projekte/fractal-demo/main.js) koordiniert weiterhin viele
  Features: Initialisierung, Audio-Anschluss, Preset- und
  Fullscreen-Verknüpfungen. Die Modulationsauswertung wurde inzwischen
  ausgelagert.
- [presets.js](../src/projekte/fractal-demo/presets.js) mischt weiterhin
  Bibliotheks-UI, Aktionen und Legacy-Import. Auth-UI und Sessiondienst liegen
  in [community-auth-ui.js](../src/projekte/fractal-demo/community-auth-ui.js)
  und [community-session.js](../src/projekte/fractal-demo/community-session.js);
  der Preset-Controller konsumiert aber weiterhin Auth-Snapshots.
- [modulation.js](../src/projekte/fractal-demo/modulation.js) vereint
  Quelltypen, Transformations-Registry, Fabriken und Parameterein-/ausgabe.
  Die Evaluation liegt jetzt in
  [modulation-engine.js](../src/projekte/fractal-demo/modulation-engine.js);
  deren Aufruf bleibt in `main.js`.
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
| App-Start | [main.js](../src/projekte/fractal-demo/main.js), ca. 277 Zeilen. Initialisiert WebGPU, Renderer, Colormap, Audio, Knobs, Modulation, Presets, Problemberichte und Fullscreen-Kommunikation. |
| Fractal Engine | [fractal-renderer.js](../src/projekte/fractal-demo/fractal-renderer.js), ca. 218 Zeilen, enthält GPU-Ressourcen und eingebetteten WGSL-Code. Navigation liegt separat in [fractal-navigation.js](../src/projekte/fractal-demo/fractal-navigation.js). |
| Colormap | [colormap/](../src/projekte/fractal-demo/colormap) ist bereits fachlich gruppiert: GPU-Code, Parameter und WGSL-Shader. |
| Modulation | [modulation.js](../src/projekte/fractal-demo/modulation.js), ca. 235 Zeilen; [knob-state.js](../src/projekte/fractal-demo/knob-state.js) enthält Zustand und Modulationsserialisierung. Die Evaluation liegt in [modulation-engine.js](../src/projekte/fractal-demo/modulation-engine.js), die `main.js` aufruft. |
| Audio | [audio-input.js](../src/projekte/fractal-demo/audio-input.js) verbindet WebAudio, Worklet und WASM; [audio-updates.js](../src/projekte/fractal-demo/audio-updates.js) taktet Updates; [beat-divisions.js](../src/projekte/fractal-demo/beat-divisions.js) enthält Beat-Zeitbasis. |
| Presets | [presets.js](../src/projekte/fractal-demo/presets.js) enthält Bibliothekssteuerung, Aktionen und Legacy-Import. Kartendarstellung liegt in [ui/preset-card.js](../src/projekte/fractal-demo/ui/preset-card.js), Formatlogik in [preset-format.js](../src/projekte/fractal-demo/preset-format.js), Supabase-Zugriffe in [community-store.js](../src/projekte/fractal-demo/community-store.js). |
| Auth | [community-auth.js](../src/projekte/fractal-demo/community-auth.js) kapselt OAuth-Funktionen; [community-session.js](../src/projekte/fractal-demo/community-session.js) verwaltet Session und Adminprofil; [community-auth-ui.js](../src/projekte/fractal-demo/community-auth-ui.js) rendert Auth-Zustand und bindet die Controls. [supabase-client.js](../src/projekte/fractal-demo/supabase-client.js) erzeugt den Client. |
| Problemberichte | [problem-report.js](../src/projekte/fractal-demo/problem-report.js) enthält Formularverhalten, Turnstile-Laden/-Verifikation und Meldungsmetadaten. [problem-report-store.js](../src/projekte/fractal-demo/problem-report-store.js) enthält den separaten Supabase-Datenzugriff. |
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
| [main.js](../src/projekte/fractal-demo/main.js) | `src/app/fractal-demo/` plus Feature-Module | Nicht nur umbenennen. Modulationsauswertung ist bereits ausgelagert; als Nächstes Fullscreen-/Audio-Orchestrierung trennen und schrittweise einen dünnen Bootstrap behalten. |
| [fractal-renderer.js](../src/projekte/fractal-demo/fractal-renderer.js), [fractal-navigation.js](../src/projekte/fractal-demo/fractal-navigation.js) | `src/features/fractal-engine/renderer` und `navigation` | Als gemeinsame Engine-Grenze erhalten. Renderer-API stabil halten. |
| [colormap/](../src/projekte/fractal-demo/colormap) | `src/features/colormap/` | Schon relativ gut separiert; hauptsächlich Pfadänderung. |
| [modulation.js](../src/projekte/fractal-demo/modulation.js), [knob-state.js](../src/projekte/fractal-demo/knob-state.js), [modulation-engine.js](../src/projekte/fractal-demo/modulation-engine.js) | `src/features/modulation/` | Evaluation ist extrahiert; Registry, Modell und Serialisierung beim späteren Umzug weiter entflechten. |
| [audio-input.js](../src/projekte/fractal-demo/audio-input.js), [audio-updates.js](../src/projekte/fractal-demo/audio-updates.js), [pcm-processor.js](../src/projekte/fractal-demo/pcm-processor.js), [beat-divisions.js](../src/projekte/fractal-demo/beat-divisions.js) | `src/features/audio/` | Capture, Worklet, Verarbeitung und Zeitbasis bündeln, ohne Audio-Verhalten zu ändern. |
| [presets.js](../src/projekte/fractal-demo/presets.js), [preset-format.js](../src/projekte/fractal-demo/preset-format.js) | `src/features/presets/` | Formatkern getrennt lassen; Bibliothekscontroller, Karten und lokale Importe schrittweise trennen. |
| [community-store.js](../src/projekte/fractal-demo/community-store.js) | `src/features/presets/data/` | Enthält jetzt nur Preset-/Like-Abfragen. Problembericht-Zugriff liegt separat in [problem-report-store.js](../src/projekte/fractal-demo/problem-report-store.js). |
| [community-auth.js](../src/projekte/fractal-demo/community-auth.js), [community-session.js](../src/projekte/fractal-demo/community-session.js), [community-auth-ui.js](../src/projekte/fractal-demo/community-auth-ui.js) | `src/features/auth/` | OAuth, Session und Auth-UI sind getrennt; der App-Bootstrap injiziert Aktionen, während der Preset-Controller Auth-Snapshots für Berechtigungen konsumiert. |
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
2. Session, Profilstatus und Auth-Controls wurden in
   `community-session.js` und `community-auth-ui.js` verlagert; OAuth-Aktionen
   werden über den App-Bootstrap injiziert.
3. Preset-UI auf Bibliothekscontroller, Preset-Karten und lokale Legacy-Importe
   aufteilen. `preset-format.js` als Formatkern behalten.
4. Modulations-Engine weiter entkoppeln: Quellen und Knob-Zustand sauber
   trennen. Das Overlay arbeitet über explizite Abhängigkeiten und Callbacks.
5. `submitProblem` wurde in `problem-report-store.js` verschoben; künftig
   Formular und Turnstile-Anwendungslogik getrennt vom Datenzugriff halten.
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
3. Preset-Controller und Modulations-Registries in kleinere Module teilen.
4. Overlay-Abhängigkeiten explizit machen.
5. Doppelte HTML-Einstiege und CSS-Struktur separat angehen.
6. WASM-Artefakte und Deploypfade zuletzt bereinigen.

Nach jedem Schritt: `npm test`, `npm run build`, `git diff --check`; für
Einstiegsseiten, Overlays und CSS zusätzlich einen kurzen Browser-Check.
