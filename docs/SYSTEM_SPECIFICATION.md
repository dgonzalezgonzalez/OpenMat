# OpenMat System Specification & Design Tokens

## Architecture Overview
OpenMat is designed with a modular desktop layout inspired by high-productivity scientific engineering environments.

---

## 1. Design System & Tokens
The user interface adheres to a clean, high-contrast palette defined in `src/styles/openmat-theme.css`:
- `--om-backgroundColor-primary`: Primary panel background (`#ffffff`).
- `--om-backgroundColor-ribbon`: Toolstrip background (`#f0f2f5`).
- `--om-borderColor-activeTab`: Highlight color for active tabs (`#0284c7`).
- `--om-color-prompt`: Terminal prompt color (`#1a365d`).
- `--om-font-sans`: System sans-serif typography stack.
- `--om-font-mono`: Menlo, Monaco, Consolas monospace stack for REPL and editor.

---

## 2. Desktop Layout & Docking
The application uses a responsive multi-panel dock layout:
1. **Toolstrip Ribbon**: Fixed-height top navigation grouping actions into hierarchical tabs and sections.
2. **Current Folder**: Left panel providing file tree navigation and filterable directory exploration.
3. **Workspace**: Variable inspector showing variable names, values, dimensions, byte sizes, and data types.
4. **Editor**: Tabbed code editor supporting multi-line matrix scripts (`.m`) with line numbering and run shortcuts.
5. **Command Window**: Interactive REPL with prompt `>>`, command echo, formatted numerical outputs, and error handling.
6. **Figure Window**: Dynamic plotting canvas rendering line plots, scatter charts, and histograms.
7. **Command History**: Chronological log of past executions with instant re-run capability.

---

## 3. Headless Batch Execution Protocol
For heavy computation, OpenMat can bridge to an external host engine:
- **Execution Mode**: Executes commands via `-batch "<command>"` headlessly without UI overhead.
- **Output Protocol**: Formats stdout into standard array displays and returns results to the Command Window and Workspace.
