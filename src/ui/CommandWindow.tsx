import React, { useState, useRef, useEffect } from 'react';
import { Terminal, RotateCcw } from 'lucide-react';
import { ExecutionOutput } from '../engine/types';

interface CommandWindowProps {
  history: { command: string; output: ExecutionOutput[] }[];
  onExecute: (command: string) => void;
  onClear: () => void;
  activeEngine: 'native' | 'bridge';
}

export const CommandWindow: React.FC<CommandWindowProps> = ({
  history,
  onExecute,
  onClear,
  activeEngine
}) => {
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = input.trim();
      if (cmd) {
        onExecute(cmd);
        setInput('');
        setHistoryIndex(null);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const newIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setInput(history[newIndex].command);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === null) return;
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex].command);
      } else {
        setHistoryIndex(null);
        setInput('');
      }
    }
  };

  return (
    <div
      className="mw-panel h-full flex flex-col cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Panel Header */}
      <div className="mw-panel-header">
        <div className="flex items-center space-x-1">
          <Terminal size={13} className="text-gray-700" />
          <span>Command Window</span>
          <span className="text-[10px] text-gray-400 font-mono">
            ({activeEngine === 'native' ? 'Native Engine' : 'Host MATLAB Bridge'})
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          title="Clear Command Window (clc)"
          className="hover:bg-gray-200 p-0.5 rounded text-gray-600"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* Output & REPL Scrollable Body */}
      <div className="flex-1 mw-command-window p-3 overflow-y-auto">
        <div className="text-gray-500 text-xs mb-3 font-mono">
          To get started, type a MATLAB command or expression and press Enter.
          <br />
          Try: <code className="text-[#0076a8]">A = [1 2; 3 4]; inv(A) * A</code> or <code className="text-[#0076a8]">x = 0:0.1:10; plot(x, sin(x))</code>
        </div>

        {history.map((item, idx) => (
          <div key={idx} className="mb-2">
            {/* Command Echo */}
            <div className="flex items-center font-mono">
              <span className="mw-prompt">&gt;&gt;</span>
              <span className="font-semibold text-gray-900">{item.command}</span>
            </div>

            {/* Output */}
            {item.output.map((out, outIdx) => (
              <div
                key={outIdx}
                className={`font-mono text-xs mt-1 whitespace-pre-wrap ${
                  out.isError ? 'text-red-600 font-semibold' : 'text-gray-800'
                }`}
              >
                {out.text}
              </div>
            ))}
          </div>
        ))}

        {/* Current Active Command Input Line */}
        <div className="flex items-center font-mono mt-1">
          <span className="mw-prompt">&gt;&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="flex-1 bg-transparent outline-none font-mono text-xs text-gray-900 border-none p-0"
            spellCheck={false}
          />
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
