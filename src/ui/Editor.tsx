import React from 'react';
import { FileCode, Play, Save, X, Plus } from 'lucide-react';

export interface EditorTab {
  id: string;
  name: string;
  content: string;
  isModified?: boolean;
}

interface EditorProps {
  tabs: EditorTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onChangeContent: (id: string, content: string) => void;
  onRunScript: () => void;
}

export const Editor: React.FC<EditorProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onChangeContent,
  onRunScript
}) => {
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const lines = (activeTab?.content || '').split('\n');

  return (
    <div className="om-panel h-full flex flex-col">
      {/* Editor Tab Bar */}
      <div className="flex items-center bg-[#e4e7eb] border-b border-[#c9d0d8] px-1 pt-1 space-x-1 select-none">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex items-center space-x-1.5 px-3 py-1 text-xs cursor-pointer rounded-t border-t border-l border-r ${
              tab.id === activeTabId
                ? 'bg-white border-[#c9d0d8] font-semibold text-gray-900 shadow-sm'
                : 'bg-[#e8ecf0] border-transparent text-gray-600 hover:bg-gray-200'
            }`}
          >
            <FileCode size={12} className="text-[#0076a8]" />
            <span className="font-mono text-[11px]">{tab.name}</span>
            {tab.isModified && <span className="text-amber-600 font-bold">*</span>}
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="hover:bg-gray-300 p-0.5 rounded text-gray-500"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}

        <button
          onClick={onNewTab}
          title="New Script"
          className="p-1 hover:bg-gray-300 rounded text-gray-600"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Editor Sub-Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#f8fafc] border-b border-[#e2e8f0] text-xs">
        <div className="flex items-center space-x-2">
          <button
            onClick={onRunScript}
            className="flex items-center space-x-1 px-2.5 py-1 bg-green-50 hover:bg-green-100 text-green-700 font-semibold border border-green-200 rounded text-[11px]"
          >
            <Play size={12} className="fill-green-600" />
            <span>Run Script</span>
          </button>
          <button
            onClick={() => {}}
            className="flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 font-medium border border-gray-300 rounded text-[11px]"
          >
            <Save size={12} className="text-blue-600" />
            <span>Save</span>
          </button>
        </div>
        <div className="text-[10px] text-gray-400 font-mono">
          Lines: {lines.length} | Matrix Script (.m)
        </div>
      </div>

      {/* Editor Code Area with Line Numbers */}
      <div className="flex-1 flex overflow-hidden bg-white">
        {/* Line Numbers */}
        <div className="w-10 bg-[#f8fafc] border-r border-[#e2e8f0] py-2 px-1 text-right select-none font-mono text-[11px] text-gray-400">
          {lines.map((_, i) => (
            <div key={i} className="leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          value={activeTab?.content || ''}
          onChange={(e) => onChangeContent(activeTab.id, e.target.value)}
          className="flex-1 p-2 font-mono text-xs leading-5 text-gray-900 outline-none resize-none overflow-auto border-none bg-transparent"
          spellCheck={false}
        />
      </div>
    </div>
  );
};
