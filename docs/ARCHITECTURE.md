# OpenMat: Architecture & Clean-Room Design Specification

## Overview

**OpenMat** is a modern, open-source scientific computing environment and IDE designed for matrix programming, technical computing, and scientific visualization. It provides:
1. An authentic, dockable **Desktop UI** (Toolstrip ribbon, Command Window REPL, Workspace variable inspector, Current Folder explorer, Tabbed Script Editor, and Plot Figure canvas).
2. A fast, zero-dependency **Native Engine** written in TypeScript that executes matrix scripts, linear algebra, control flow, functions, and 2D/3D plotting.
3. A **Dual-Engine Bridge Architecture** allowing seamless execution routing to the host machine's native engine when external toolboxes or specialized routines are needed.

```mermaid
flowchart TD
    User["User Interface"] --> App["OpenMat Desktop App"]
    App --> Ribbon["Toolstrip Ribbon (Home / Plots / Apps / Editor)"]
    App --> Editor["Tabbed Script Editor (.m)"]
    App --> CW["Command Window REPL (>> prompt)"]
    App --> WS["Workspace Inspector (Variables & Types)"]
    App --> CF["Current Folder Explorer"]
    App --> Fig["Figure & Plot Canvas"]

    CW & Editor --> Router{"Execution Engine Router"}
    Router -->|"Fast In-Memory"| NativeEngine["Native OpenMat Engine\n(Lexer, Parser, AST, Matrix Core)"]
    Router -->|"Host Batch"| Bridge["Host Native Engine Bridge"]

    NativeEngine --> WS
    NativeEngine --> Fig
    Bridge --> WS
    Bridge --> Fig
```

---

## 1. Clean-Room Engineering Principles

OpenMat is designed with rigorous clean-room standards:
- **Original Language Engine**: The lexer, recursive descent parser, multidimensional matrix subsystem, and interpreter are engineered completely from scratch.
- **Open Standards**: Built using standard TypeScript, React, and Tailwind CSS.
- **Original Branding**: Features an original open-bracket geometric emblem `[ · ]`.
- **Permissive Open Source**: Licensed under the MIT License for open scientific collaboration.

---

## 2. Engine Pipeline

### 2.1 Lexical Analysis (`src/engine/lexer.ts`)
The lexer handles unique lexical rules of scientific matrix scripting:
- **Transpose vs String Quotes**: Automatically distinguishes the transpose operator `'` (when following numbers, identifiers, or closing delimiters) from the start of string literals `'...'`.
- **Matrix Delimiters**: Treats spaces inside bracketed matrix literals `[1 2 3]` as element separators equivalent to `,`.
- **Element-wise Operators**: Multi-character tokens (`.*`, `./`, `.^`, `.\`, `.'`).
- **Comments**: Single-line `%` and multi-line `%{ ... %}` block comments.

### 2.2 AST Parsing (`src/engine/parser.ts`)
The recursive descent parser builds a structured AST respecting mathematical precedence:
- Logical OR (`||`, `|`)
- Logical AND (`&&`, `&`)
- Equality & Relational (`==`, `~=`, `<`, `<=`, `>`, `>=`)
- Colon Ranges (`start:step:end` or `start:end`)
- Arithmetic (`+`, `-`, `*`, `/`, `\`, `.*`, `./`, `.\`, `^`, `.^`)
- Unary prefix (`+`, `-`, `~`) and postfix (`'`, `.'`)
- 1-Based Indexing and Slicing (`A(1:2, :)`, `A(end)`)
- Control Flow (`if/elseif/else`, `for`, `while`)
- Function Definitions (`function [out] = name(in)`)
- Command-style invocations (`clear all`, `clc`, `grid on`, `help plot`)

### 2.3 Numerical Matrix Core (`src/engine/matrix.ts`)
- **1-Based Indexing**: Mathematical matrix convention where row and column indices start at 1.
- **Linear Algebra**:
  - Determinant calculation via Gaussian elimination with partial pivoting (`det`).
  - Matrix inversion via Gauss-Jordan elimination (`inv`).
  - Matrix multiplication (`mul`).
  - Element-wise operations (`dotMul`, `dotDiv`, `dotPow`).
  - Reductions (`sum`, `mean`, `min`, `max`, `norm`, `trace`).
  - Output formatting matching standard tabular console representations.

---

## 3. Host Engine Bridge (`src/engine/bridge.ts`)

When running in an environment with a local host scientific computation engine installed, OpenMat provides an optional bridge:
- Detects the host engine executable on the system.
- Executes commands in headless batch mode:
  ```bash
  <engine-path> -batch "<command>; exit;"
  ```
- Returns standard output, error streams, and exit codes directly into the OpenMat Command Window and Workspace.

---

## 4. Desktop UI Replication

Modeled after modern scientific computing desktop environments:
- **Toolstrip Ribbon**: HOME, PLOTS, APPS, and EDITOR tabs with organized sections (FILE, VARIABLE, CODE, ENVIRONMENT, RESOURCES).
- **Command Window**: Interactive REPL with `>>` prompt, up/down command history, and clear screen (`clc`).
- **Workspace Inspector**: Real-time table of active variables, displaying Name, Value, Size, Bytes, and Class (`double`, `char`, `logical`).
- **Current Folder**: File browser with directory path bar, file search, and `.m` script association.
- **Script Editor**: Tabbed code editor with line numbers, syntax highlighting, and one-click script execution.
- **Figure Window**: Integrated canvas for 2D line plots, scatter plots, bar charts, and histograms.
