import React, { useState } from 'react';
import { Database, Search, Trash2, Hash, Grid, Type, ToggleLeft } from 'lucide-react';
import { Matrix } from '../engine/matrix';
import { WorkspaceVariable } from '../engine/types';

interface WorkspaceProps {
  variables: Record<string, any>;
  onClear: () => void;
  onSelectVariable?: (name: string, val: any) => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  variables,
  onClear,
  onSelectVariable
}) => {
  const [filter, setFilter] = useState('');

  const varList: WorkspaceVariable[] = Object.keys(variables).map((key) => {
    const val = variables[key];
    if (val instanceof Matrix) {
      const isScalar = val.isScalar();
      return {
        name: key,
        value: isScalar ? val.getScalar() : `[${val.rows}x${val.cols} double]`,
        size: `${val.rows}x${val.cols}`,
        bytes: val.rows * val.cols * 8,
        class: 'double',
        min: val.min(),
        max: val.max()
      };
    } else if (typeof val === 'string') {
      return {
        name: key,
        value: `'${val}'`,
        size: `1x${val.length}`,
        bytes: val.length * 2,
        class: 'char'
      };
    } else if (typeof val === 'boolean') {
      return {
        name: key,
        value: val ? 'true' : 'false',
        size: '1x1',
        bytes: 1,
        class: 'logical'
      };
    } else {
      return {
        name: key,
        value: String(val),
        size: '1x1',
        bytes: 8,
        class: 'double'
      };
    }
  });

  const filtered = varList.filter(v =>
    v.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="mw-panel h-full flex flex-col">
      {/* Panel Header */}
      <div className="mw-panel-header">
        <div className="flex items-center space-x-1">
          <Database size={13} className="text-blue-600" />
          <span>Workspace</span>
        </div>
        <button onClick={onClear} title="Clear Workspace" className="hover:bg-gray-200 p-0.5 rounded text-gray-600">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center px-2 py-1 border-b border-[#e2e8f0] bg-white">
        <Search size={12} className="text-gray-400 mr-1.5" />
        <input
          type="text"
          placeholder="Filter workspace..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full text-[11px] outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* Variables Table */}
      <div className="flex-1 overflow-y-auto text-[11px]">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-xs italic">
            Workspace is empty
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#f1f5f9] text-gray-500 border-b border-[#e2e8f0] text-left">
                <th className="py-1 px-2 font-medium">Name</th>
                <th className="py-1 px-2 font-medium">Value</th>
                <th className="py-1 px-2 font-medium">Size</th>
                <th className="py-1 px-2 font-medium">Class</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.name}
                  onClick={() => onSelectVariable && onSelectVariable(item.name, variables[item.name])}
                  className="hover:bg-[#e0f2fe] cursor-pointer border-b border-gray-100"
                >
                  <td className="py-1 px-2 font-mono font-semibold text-gray-800 flex items-center space-x-1.5">
                    {item.class === 'double' && item.size === '1x1' ? (
                      <Hash size={12} className="text-blue-500" />
                    ) : item.class === 'double' ? (
                      <Grid size={12} className="text-indigo-600" />
                    ) : item.class === 'char' ? (
                      <Type size={12} className="text-emerald-600" />
                    ) : (
                      <ToggleLeft size={12} className="text-purple-600" />
                    )}
                    <span>{item.name}</span>
                  </td>
                  <td className="py-1 px-2 font-mono text-gray-600 max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {String(item.value)}
                  </td>
                  <td className="py-1 px-2 font-mono text-gray-400 text-[10px]">
                    {item.size}
                  </td>
                  <td className="py-1 px-2 text-gray-500 text-[10px]">
                    {item.class}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
