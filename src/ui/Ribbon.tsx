import React from 'react';
import {
  FileText,
  FolderOpen,
  Save,
  Play,
  RotateCcw,
  Trash2,
  Settings,
  HelpCircle,
  BarChart2,
  LineChart,
  PieChart,
  LayoutGrid,
  Cpu,
  Layers,
  Search,
  Sparkles
} from 'lucide-react';

export type RibbonTab = 'HOME' | 'PLOTS' | 'APPS' | 'EDITOR';

interface RibbonProps {
  activeTab: RibbonTab;
  setActiveTab: (tab: RibbonTab) => void;
  onNewScript: () => void;
  onRunScript: () => void;
  onClearWorkspace: () => void;
  onClearCommandWindow: () => void;
  activeEngine: 'native' | 'bridge';
  setActiveEngine: (engine: 'native' | 'bridge') => void;
  bridgeAvailable: boolean;
  onOpenPlotGallery: (type: string) => void;
}

export const Ribbon: React.FC<RibbonProps> = ({
  activeTab,
  setActiveTab,
  onNewScript,
  onRunScript,
  onClearWorkspace,
  onClearCommandWindow,
  activeEngine,
  setActiveEngine,
  bridgeAvailable,
  onOpenPlotGallery
}) => {
  return (
    <div className="w-full bg-[#f0f2f5] border-b border-[#c9d0d8] flex flex-col select-none">
      {/* Title Bar & Quick Access Toolbar */}
      <div className="h-8 bg-[#1e293b] text-white flex items-center justify-between px-3 text-xs border-b border-[#0f172a]">
        <div className="flex items-center space-x-3">
          <img src="/src/assets/logo.svg" alt="OpenMat Logo" className="w-5 h-5 rounded" />
          <span className="font-semibold tracking-wide">OpenMat R2025b</span>
          <span className="text-gray-400 text-[11px] font-mono">
            [Engine: {activeEngine === 'native' ? 'Native OpenMat (Fast In-Memory)' : 'Local MATLAB R2025b Bridge'}]
          </span>
        </div>

        {/* Quick Access Icons */}
        <div className="flex items-center space-x-2 text-gray-300">
          <button onClick={onNewScript} title="New Script (Ctrl+N)" className="hover:text-white p-1">
            <FileText size={14} />
          </button>
          <button onClick={onRunScript} title="Run Current Script (F5)" className="hover:text-green-400 p-1 text-green-500">
            <Play size={14} />
          </button>
          <button onClick={onClearCommandWindow} title="Clear Command Window" className="hover:text-white p-1">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Ribbon Tabs Header */}
      <div className="flex items-center space-x-1 px-2 pt-1 border-b border-[#c9d0d8] bg-[#e4e7eb]">
        {(['HOME', 'PLOTS', 'APPS', 'EDITOR'] as RibbonTab[]).map((tab) => (
          <div
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`mw-ribbon-tab ${activeTab === tab ? 'active' : ''}`}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Ribbon Toolstrip Toolbar Content */}
      <div className="h-20 px-3 py-1 flex items-center space-x-3 overflow-x-auto bg-[#f0f2f5]">
        {activeTab === 'HOME' && (
          <>
            {/* FILE SECTION */}
            <div className="flex flex-col items-center h-full pr-3 border-r border-[#d1d5db]">
              <div className="flex items-center space-x-2">
                <button onClick={onNewScript} className="mw-tool-button w-14">
                  <FileText size={24} className="text-[#0076a8]" />
                  <span className="text-[10px] mt-1 text-center font-medium">New Script</span>
                </button>
                <div className="flex flex-col space-y-1">
                  <button className="flex items-center space-x-1 px-2 py-0.5 text-[11px] hover:bg-[#e0e6ed] rounded">
                    <FolderOpen size={13} className="text-amber-600" />
                    <span>Open</span>
                  </button>
                  <button className="flex items-center space-x-1 px-2 py-0.5 text-[11px] hover:bg-[#e0e6ed] rounded">
                    <Search size={13} className="text-gray-600" />
                    <span>Find Files</span>
                  </button>
                </div>
              </div>
              <span className="text-[9px] text-gray-500 mt-auto uppercase tracking-wider font-semibold">FILE</span>
            </div>

            {/* VARIABLE SECTION */}
            <div className="flex flex-col items-center h-full px-3 border-r border-[#d1d5db]">
              <div className="flex items-center space-x-2">
                <button onClick={onClearWorkspace} className="mw-tool-button w-14">
                  <Trash2 size={24} className="text-red-500" />
                  <span className="text-[10px] mt-1 text-center font-medium">Clear WS</span>
                </button>
                <div className="flex flex-col space-y-1">
                  <button className="flex items-center space-x-1 px-2 py-0.5 text-[11px] hover:bg-[#e0e6ed] rounded">
                    <Layers size={13} className="text-indigo-600" />
                    <span>Import Data</span>
                  </button>
                  <button className="flex items-center space-x-1 px-2 py-0.5 text-[11px] hover:bg-[#e0e6ed] rounded">
                    <Save size={13} className="text-blue-600" />
                    <span>Save WS</span>
                  </button>
                </div>
              </div>
              <span className="text-[9px] text-gray-500 mt-auto uppercase tracking-wider font-semibold">VARIABLE</span>
            </div>

            {/* CODE SECTION */}
            <div className="flex flex-col items-center h-full px-3 border-r border-[#d1d5db]">
              <div className="flex items-center space-x-2">
                <button onClick={onRunScript} className="mw-tool-button w-14 bg-green-50 hover:bg-green-100 border-green-200">
                  <Play size={24} className="text-green-600 fill-green-600" />
                  <span className="text-[10px] mt-1 text-center font-bold text-green-800">Run</span>
                </button>
                <div className="flex flex-col space-y-1">
                  <button onClick={onClearCommandWindow} className="flex items-center space-x-1 px-2 py-0.5 text-[11px] hover:bg-[#e0e6ed] rounded">
                    <RotateCcw size={13} className="text-gray-600" />
                    <span>Clear Cmd</span>
                  </button>
                </div>
              </div>
              <span className="text-[9px] text-gray-500 mt-auto uppercase tracking-wider font-semibold">CODE</span>
            </div>

            {/* ENVIRONMENT & ENGINE SECTION */}
            <div className="flex flex-col items-center h-full px-3 border-r border-[#d1d5db]">
              <div className="flex items-center space-x-2">
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center space-x-1">
                    <Cpu size={14} className="text-blue-600" />
                    <span className="text-[11px] font-semibold text-gray-700">Engine:</span>
                  </div>
                  <select
                    value={activeEngine}
                    onChange={(e) => setActiveEngine(e.target.value as 'native' | 'bridge')}
                    className="text-[11px] bg-white border border-[#c9d0d8] rounded px-1.5 py-0.5 font-medium text-gray-800 outline-none"
                  >
                    <option value="native">Native OpenMat (Instant)</option>
                    <option value="bridge" disabled={!bridgeAvailable}>
                      {bridgeAvailable ? 'Host MATLAB R2025b Bridge' : 'Local Bridge (Not Available)'}
                    </option>
                  </select>
                </div>
                <button className="mw-tool-button w-12">
                  <Settings size={20} className="text-gray-600" />
                  <span className="text-[9px] mt-1 text-center">Layout</span>
                </button>
              </div>
              <span className="text-[9px] text-gray-500 mt-auto uppercase tracking-wider font-semibold">ENVIRONMENT</span>
            </div>

            {/* RESOURCES SECTION */}
            <div className="flex flex-col items-center h-full px-3">
              <div className="flex items-center space-x-2">
                <button className="mw-tool-button w-12">
                  <HelpCircle size={22} className="text-blue-600" />
                  <span className="text-[10px] mt-1 text-center">Help</span>
                </button>
                <button className="mw-tool-button w-12">
                  <Sparkles size={22} className="text-purple-600" />
                  <span className="text-[10px] mt-1 text-center">Community</span>
                </button>
              </div>
              <span className="text-[9px] text-gray-500 mt-auto uppercase tracking-wider font-semibold">RESOURCES</span>
            </div>
          </>
        )}

        {activeTab === 'PLOTS' && (
          <div className="flex items-center space-x-4">
            <button onClick={() => onOpenPlotGallery('line')} className="mw-tool-button w-14">
              <LineChart size={24} className="text-[#0072BD]" />
              <span className="text-[10px] mt-1 font-medium">plot</span>
            </button>
            <button onClick={() => onOpenPlotGallery('scatter')} className="mw-tool-button w-14">
              <LayoutGrid size={24} className="text-[#D95319]" />
              <span className="text-[10px] mt-1 font-medium">scatter</span>
            </button>
            <button onClick={() => onOpenPlotGallery('bar')} className="mw-tool-button w-14">
              <BarChart2 size={24} className="text-[#77AC30]" />
              <span className="text-[10px] mt-1 font-medium">bar</span>
            </button>
            <button onClick={() => onOpenPlotGallery('histogram')} className="mw-tool-button w-14">
              <PieChart size={24} className="text-[#7E2F8E]" />
              <span className="text-[10px] mt-1 font-medium">histogram</span>
            </button>
          </div>
        )}

        {activeTab === 'APPS' && (
          <div className="flex items-center space-x-3 text-xs text-gray-600">
            <div className="p-2 border border-dashed border-gray-300 rounded bg-white flex items-center space-x-2">
              <Layers size={20} className="text-blue-600" />
              <div>
                <div className="font-semibold text-gray-800">Linear Algebra Tool</div>
                <div className="text-[10px] text-gray-500">Eigenvalues, SVD & Inverses</div>
              </div>
            </div>
            <div className="p-2 border border-dashed border-gray-300 rounded bg-white flex items-center space-x-2">
              <BarChart2 size={20} className="text-amber-600" />
              <div>
                <div className="font-semibold text-gray-800">Signal Analysis App</div>
                <div className="text-[10px] text-gray-500">Waveforms & Harmonics</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'EDITOR' && (
          <div className="flex items-center space-x-4">
            <button onClick={onRunScript} className="mw-tool-button w-14 bg-green-50 hover:bg-green-100 border-green-200">
              <Play size={24} className="text-green-600 fill-green-600" />
              <span className="text-[10px] mt-1 font-bold text-green-800">Run Script</span>
            </button>
            <button onClick={onNewScript} className="mw-tool-button w-14">
              <FileText size={24} className="text-blue-600" />
              <span className="text-[10px] mt-1 font-medium">New File</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
