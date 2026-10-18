import React, { useState } from 'react';
import { History, Search, Trash2 } from 'lucide-react';

interface HistoryItem {
  timestamp: string;
  command: string;
}

interface CommandHistoryProps {
  items: HistoryItem[];
  onSelectCommand: (cmd: string) => void;
  onClear: () => void;
}

export const CommandHistory: React.FC<CommandHistoryProps> = ({
  items,
  onSelectCommand,
  onClear
}) => {
  const [filter, setFilter] = useState('');

  const filtered = items.filter(i =>
    i.command.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="om-panel h-full flex flex-col">
      {/* Panel Header */}
      <div className="om-panel-header">
        <div className="flex items-center space-x-1">
          <History size={13} className="text-gray-600" />
          <span>Command History</span>
        </div>
        <button onClick={onClear} title="Clear History" className="hover:bg-gray-200 p-0.5 rounded text-gray-600">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center px-2 py-1 border-b border-[#e2e8f0] bg-white">
        <Search size={12} className="text-gray-400 mr-1.5" />
        <input
          type="text"
          placeholder="Filter history..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full text-[11px] outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* History Items List */}
      <div className="flex-1 overflow-y-auto text-[11px] font-mono">
        {filtered.length === 0 ? (
          <div className="p-3 text-center text-gray-400 text-xs italic">
            No history
          </div>
        ) : (
          filtered.map((item, idx) => (
            <div
              key={idx}
              onDoubleClick={() => onSelectCommand(item.command)}
              title="Double click to run"
              className="px-2 py-1 border-b border-gray-100 hover:bg-[#e0f2fe] cursor-pointer text-gray-800 flex items-center justify-between"
            >
              <span className="truncate mr-2 font-medium">{item.command}</span>
              <span className="text-[9px] text-gray-400 shrink-0 font-sans">{item.timestamp}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
