import React, { useState } from 'react';
import {
  Folder,
  FileCode,
  FileText,
  File,
  Search,
  ArrowUp,
  RefreshCw,
  Plus
} from 'lucide-react';

export interface FileItem {
  name: string;
  type: 'script' | 'mat' | 'text' | 'folder';
  size: string;
  modified: string;
  content?: string;
}

interface CurrentFolderProps {
  currentPath: string;
  files: FileItem[];
  onSelectFile: (file: FileItem) => void;
  onNewFile: () => void;
  onNavigateUp: () => void;
}

export const CurrentFolder: React.FC<CurrentFolderProps> = ({
  currentPath,
  files,
  onSelectFile,
  onNewFile,
  onNavigateUp
}) => {
  const [search, setSearch] = useState('');

  const filteredFiles = files.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="om-panel h-full flex flex-col">
      {/* Panel Header */}
      <div className="om-panel-header">
        <div className="flex items-center space-x-1">
          <Folder size={13} className="text-amber-500 fill-amber-500" />
          <span>Current Folder</span>
        </div>
        <button onClick={onNewFile} title="New Script" className="hover:bg-gray-200 p-0.5 rounded">
          <Plus size={13} />
        </button>
      </div>

      {/* Path Bar */}
      <div className="flex items-center space-x-1 px-2 py-1 bg-[#f8fafc] border-b border-[#e2e8f0] text-xs">
        <button
          onClick={onNavigateUp}
          title="Up one folder"
          disabled={currentPath === '/'}
          className="p-0.5 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ArrowUp size={12} />
        </button>
        <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-gray-700 bg-white px-1.5 py-0.5 border border-gray-300 rounded">
          {currentPath}
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center px-2 py-1 border-b border-[#e2e8f0] bg-white">
        <Search size={12} className="text-gray-400 mr-1.5" />
        <input
          type="text"
          placeholder="Filter files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-[11px] outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* File List Table */}
      <div className="flex-1 overflow-y-auto text-[11px]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#f1f5f9] text-gray-500 border-b border-[#e2e8f0] text-left">
              <th className="py-1 px-2 font-medium">Name</th>
              <th className="py-1 px-2 font-medium w-16">Size</th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.map((file) => (
              <tr
                key={file.name}
                onDoubleClick={() => onSelectFile(file)}
                className="hover:bg-[#e0f2fe] cursor-pointer border-b border-gray-100"
              >
                <td className="py-1 px-2 flex items-center space-x-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                  {file.type === 'script' ? (
                    <FileCode size={13} className="text-[#0076a8] shrink-0" />
                  ) : file.type === 'folder' ? (
                    <Folder size={13} className="text-amber-500 shrink-0 fill-amber-500" />
                  ) : (
                    <FileText size={13} className="text-gray-500 shrink-0" />
                  )}
                  <span className="font-mono text-gray-800">{file.name}</span>
                </td>
                <td className="py-1 px-2 text-gray-400 font-mono text-[10px]">
                  {file.size}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
