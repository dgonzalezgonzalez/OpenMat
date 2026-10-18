import React, { useState, useEffect } from 'react';
import { Ribbon, RibbonTab } from './Ribbon';
import { CurrentFolder, FileItem } from './CurrentFolder';
import { Workspace } from './Workspace';
import { CommandWindow } from './CommandWindow';
import { Editor, EditorTab } from './Editor';
import { FigureWindow } from './FigureWindow';
import { CommandHistory } from './CommandHistory';
import { Interpreter } from '../engine/interpreter';
import { HostEngineBridge } from '../engine/bridge';
import { PlotData, ExecutionOutput } from '../engine/types';

const INITIAL_DEMO_SCRIPT = `% OpenMat Demo Script
% Linear Algebra, Eigenvalues & Wave Plotting

disp('=== OpenMat Scientific Computing Demo ===');

% 1. Create a 3x3 symmetric matrix
A = [4, 1, 2; 1, 5, 3; 2, 3, 6];
disp('Matrix A:');
disp(A);

% 2. Compute Determinant & Inverse
detA = det(A);
invA = inv(A);
disp('Determinant:');
disp(detA);

% Verify Identity: A * inv(A)
I = A * invA;
disp('A * inv(A):');
disp(I);

% 3. Generate Harmonic Waveform & Plot
t = linspace(0, 4*pi, 100);
y1 = sin(t);
y2 = cos(t) .* exp(-0.1 * t);

plot(t, y1, 'Sine Wave');
title('Harmonic Waveform in OpenMat');
xlabel('Time (s)');
ylabel('Amplitude');
grid on;

disp('Computation complete. Check Workspace & Figure!');
`;

export const OpenMatApp: React.FC = () => {
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>('HOME');
  const [activeEngine, setActiveEngine] = useState<'native' | 'bridge'>('native');
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean>(true);

  // Engine instance
  const [interpreter] = useState<Interpreter>(() => new Interpreter());
  const [bridge] = useState<HostEngineBridge>(() => new HostEngineBridge());

  // Workspace & History State
  const [workspace, setWorkspace] = useState<Record<string, any>>({});
  const [replHistory, setReplHistory] = useState<{ command: string; output: ExecutionOutput[] }[]>([]);
  const [commandHistoryItems, setCommandHistoryItems] = useState<{ timestamp: string; command: string }[]>([]);
  const [currentPlot, setCurrentPlot] = useState<PlotData | undefined>(undefined);

  // Editor Tabs
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([
    {
      id: 'demo.m',
      name: 'demo.m',
      content: INITIAL_DEMO_SCRIPT
    }
  ]);
  const [activeEditorTabId, setActiveEditorTabId] = useState<string>('demo.m');

  // Virtual Filesystem
  const [files, setFiles] = useState<FileItem[]>([
    { name: 'demo.m', type: 'script', size: '1.2 KB', modified: 'Today 20:30', content: INITIAL_DEMO_SCRIPT },
    { name: 'fft_analysis.m', type: 'script', size: '850 B', modified: 'Yesterday', content: 'x = 0:0.01:1; y = sin(2*pi*50*x); plot(x, y);' },
    { name: 'matrix_ops.m', type: 'script', size: '640 B', modified: '16 Oct 2026', content: 'A = [1 2; 3 4]; B = A * A\'; disp(B);' },
    { name: 'data.mat', type: 'mat', size: '4.5 KB', modified: '12 Oct 2026' }
  ]);

  useEffect(() => {
    setBridgeAvailable(bridge.isAvailable());
  }, [bridge]);

  const handleExecuteCommand = async (cmd: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setCommandHistoryItems(prev => [...prev, { timestamp, command: cmd }]);

    if (cmd === 'clc') {
      setReplHistory([]);
      return;
    }

    if (cmd === 'clear' || cmd === 'clear all') {
      interpreter.execute('clear all');
      setWorkspace({});
      setReplHistory(prev => [...prev, { command: cmd, output: [] }]);
      return;
    }

    if (activeEngine === 'bridge' && bridgeAvailable) {
      const res = await bridge.executeBatch(cmd + '; exit;');
      const output: ExecutionOutput[] = [];
      if (res.stdout) output.push({ text: res.stdout.trim() });
      if (res.stderr) output.push({ text: res.stderr.trim(), isError: true });
      setReplHistory(prev => [...prev, { command: cmd, output }]);
      return;
    }

    // Native Engine Execution
    const res = interpreter.execute(cmd);
    setWorkspace(res.workspace);
    if (res.plots.length > 0) {
      setCurrentPlot(res.plots[res.plots.length - 1]);
    }
    setReplHistory(prev => [...prev, { command: cmd, output: res.outputs }]);
  };

  const handleRunScript = () => {
    const currentTab = editorTabs.find(t => t.id === activeEditorTabId);
    if (!currentTab) return;
    handleExecuteCommand(currentTab.content);
  };

  const handleNewScript = () => {
    const id = `script_${editorTabs.length + 1}.m`;
    const newTab: EditorTab = {
      id,
      name: id,
      content: '% New OpenMat Script\n'
    };
    setEditorTabs(prev => [...prev, newTab]);
    setActiveEditorTabId(id);
    setFiles(prev => [...prev, { name: id, type: 'script', size: '20 B', modified: 'Just now', content: newTab.content }]);
  };

  const handleSelectFile = (file: FileItem) => {
    if (file.type === 'script') {
      const existing = editorTabs.find(t => t.id === file.name);
      if (existing) {
        setActiveEditorTabId(existing.id);
      } else {
        const newTab: EditorTab = {
          id: file.name,
          name: file.name,
          content: file.content || ''
        };
        setEditorTabs(prev => [...prev, newTab]);
        setActiveEditorTabId(newTab.id);
      }
    }
  };

  const handleEditorContentChange = (id: string, content: string) => {
    setEditorTabs(prev =>
      prev.map(t => (t.id === id ? { ...t, content, isModified: true } : t))
    );
  };

  const handleCloseEditorTab = (id: string) => {
    if (editorTabs.length <= 1) return;
    const remaining = editorTabs.filter(t => t.id !== id);
    setEditorTabs(remaining);
    if (activeEditorTabId === id) {
      setActiveEditorTabId(remaining[0].id);
    }
  };

  const handlePlotGallery = (type: string) => {
    if (type === 'line') {
      handleExecuteCommand('t = 0:0.1:10; plot(t, sin(t)); title(\'Sine Wave\'); grid on;');
    } else if (type === 'scatter') {
      handleExecuteCommand('x = randn(1, 50); y = randn(1, 50); scatter(x, y); title(\'Scatter Plot\');');
    } else if (type === 'bar') {
      handleExecuteCommand('y = [15, 25, 40, 30, 20]; bar(y); title(\'Bar Chart\');');
    } else if (type === 'histogram') {
      handleExecuteCommand('y = randn(1, 100); histogram(y); title(\'Histogram Distribution\');');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f0f2f5]">
      {/* 1. Toolstrip Ribbon */}
      <Ribbon
        activeTab={ribbonTab}
        setActiveTab={setRibbonTab}
        onNewScript={handleNewScript}
        onRunScript={handleRunScript}
        onClearWorkspace={() => {
          interpreter.execute('clear all');
          setWorkspace({});
        }}
        onClearCommandWindow={() => setReplHistory([])}
        activeEngine={activeEngine}
        setActiveEngine={setActiveEngine}
        bridgeAvailable={bridgeAvailable}
        onOpenPlotGallery={handlePlotGallery}
      />

      {/* 2. Docked Panels Workspace Layout */}
      <div className="flex-1 flex overflow-hidden p-1 gap-1">
        {/* Left Column: Current Folder & Workspace */}
        <div className="w-64 flex flex-col gap-1 shrink-0">
          <div className="h-1/2">
            <CurrentFolder
              currentPath="/Users/diegogonzalezgonzalez/OpenMat"
              files={files}
              onSelectFile={handleSelectFile}
              onNewFile={handleNewScript}
            />
          </div>
          <div className="h-1/2">
            <Workspace
              variables={workspace}
              onClear={() => {
                interpreter.execute('clear all');
                setWorkspace({});
              }}
            />
          </div>
        </div>

        {/* Center Column: Editor & Command Window */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="h-3/5">
            <Editor
              tabs={editorTabs}
              activeTabId={activeEditorTabId}
              onSelectTab={setActiveEditorTabId}
              onCloseTab={handleCloseEditorTab}
              onNewTab={handleNewScript}
              onChangeContent={handleEditorContentChange}
              onRunScript={handleRunScript}
            />
          </div>
          <div className="h-2/5">
            <CommandWindow
              history={replHistory}
              onExecute={handleExecuteCommand}
              onClear={() => setReplHistory([])}
              activeEngine={activeEngine}
            />
          </div>
        </div>

        {/* Right Column: Figure Window & Command History */}
        <div className="w-80 flex flex-col gap-1 shrink-0">
          <div className="h-3/5">
            <FigureWindow
              plot={currentPlot}
              onClear={() => setCurrentPlot(undefined)}
            />
          </div>
          <div className="h-2/5">
            <CommandHistory
              items={commandHistoryItems}
              onSelectCommand={handleExecuteCommand}
              onClear={() => setCommandHistoryItems([])}
            />
          </div>
        </div>
      </div>

      {/* 3. Status Bar */}
      <div className="h-6 bg-[#e4e7eb] border-t border-[#c9d0d8] px-3 flex items-center justify-between text-[11px] text-gray-600 select-none">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span className="font-medium">Ready</span>
          </span>
          <span>|</span>
          <span className="font-mono text-gray-700">
            Engine: {activeEngine === 'native' ? 'Native OpenMat v1.0.0' : 'Host Native Engine Bridge'}
          </span>
        </div>
        <div className="flex items-center space-x-4">
          <span>Variables: {Object.keys(workspace).length}</span>
          <span>UTF-8</span>
          <span className="font-mono">Ln 1, Col 1</span>
        </div>
      </div>
    </div>
  );
};
