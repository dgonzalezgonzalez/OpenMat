# Reverse Engineering Analysis of MATLAB R2025b Desktop & CLI

## Target Identification
- **Target Location**: `/Applications/MATLAB_R2025b.app`
- **Application Bundle**: `com.mathworks.matlab`
- **Architecture**: Mach-O 64-bit executable `x86_64`
- **Release Version**: R2025b

---

## 1. Mach-O Binary Overview
Inspection via REA tool `inspect_macho` revealed:
- **Executable**: `/Applications/MATLAB_R2025b.app/Contents/MacOS/MATLAB`
- **SHA-256**: `f229ac68a747a6590727e5567e80629a0d1efe9e38a1dd777ed20bcf7ea2fcdb`
- **Entry Points**: 1
- **Load Commands**: 40
- **Dynamic Libraries**: 19 linked Mach-O libraries, including `libSystem.B.dylib`, MathWorks core engine dylibs, and Cocoa runtime bridges.

---

## 2. Desktop UI & WebGUI Architecture
Inspection of `/Applications/MATLAB_R2025b.app/ui/webgui/src` revealed:
- **Renderer Architecture**: Chromium Embedded Framework (`window.cefclient`) running a single-page web app.
- **Entry Points**: `index-jsd.html` (JavaScript Desktop) and `index.html` (MATLAB Online / MOTW).
- **Bundle Infrastructure**: Webpack / Dojo application framework (`bundle.index-jsd.js`, `bundle.appshell.js`, `bundle.963.js`).
- **CSS Design System**:
  - Over 150 design system variables prefixed with `--mw-`:
    - `--mw-backgroundColor-primary`: Primary pane background (`#ffffff` light, dark mode variant).
    - `--mw-backgroundColor-ribbon`: Toolstrip background (`#f0f2f5`).
    - `--mw-borderColor-active`: Highlight color for selected tabs (`#0076a8`).
    - `--mw-tab-selected-color`: Tab accent indicator.
    - `--mw-fontFamily-textField`: System font stack.

---

## 3. Headless CLI Interface
Testing the shell launcher `/Applications/MATLAB_R2025b.app/bin/matlab` revealed:
- **Batch Flag**: `-batch "MATLAB_command"` executes arbitrary MATLAB commands headlessly without opening the GUI or dock icon.
- **Stdout Protocol**: Commands that output expressions format results with standard 4-space indentations and `ans = ...`.
- **Exit Code**: Non-zero on unhandled exceptions; 0 on successful termination.
- **Response Latency**: Cold boot ~15-20s due to JVM initialization and license verification; subsequent commands fast.

---

## 4. Reconstructed Specification for OpenMat
Based on these findings, OpenMat adopts:
1. Exact matching of the `--mw-*` color palette and tabbed toolstrip hierarchy.
2. Docked panel arrangement (Current Folder, Workspace, Editor, Command Window, Figure).
3. The `-batch` headless execution protocol in `MatlabBridge` for seamless host integration.
