import React from 'react';
import {
  LineChart as LineChartIcon,
  Download,
  Grid as GridIcon,
  Maximize2,
  Trash2
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line, Scatter, Bar } from 'react-chartjs-2';
import { PlotData } from '../engine/types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface FigureWindowProps {
  plot?: PlotData;
  onClear: () => void;
}

export const FigureWindow: React.FC<FigureWindowProps> = ({ plot, onClear }) => {
  if (!plot || plot.series.length === 0) {
    return (
      <div className="mw-panel h-full flex flex-col">
        <div className="mw-panel-header">
          <div className="flex items-center space-x-1">
            <LineChartIcon size={13} className="text-emerald-600" />
            <span>Figure 1</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-gray-400 text-xs italic">
          <LineChartIcon size={32} className="text-gray-300 mb-2" />
          No active plot. Run <code className="text-[#0076a8] ml-1">plot(x, y)</code> in Command Window.
        </div>
      </div>
    );
  }

  const chartData = {
    datasets: plot.series.map((s) => ({
      label: s.label,
      data: s.x.map((xVal, i) => ({ x: xVal, y: s.y[i] })),
      borderColor: s.color || '#0072BD',
      backgroundColor: s.color || '#0072BD',
      showLine: plot.type === 'line',
      borderWidth: 2,
      pointRadius: plot.type === 'scatter' ? 4 : 0,
      tension: 0.1
    }))
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: plot.series.length > 1,
        position: 'top' as const
      },
      title: {
        display: !!plot.title,
        text: plot.title || '',
        font: { size: 13, weight: 'bold' }
      }
    },
    scales: {
      x: {
        type: 'linear' as const,
        grid: {
          display: plot.grid !== false,
          color: '#e5e7eb'
        },
        title: {
          display: !!plot.xlabel,
          text: plot.xlabel || ''
        }
      },
      y: {
        type: 'linear' as const,
        grid: {
          display: plot.grid !== false,
          color: '#e5e7eb'
        },
        title: {
          display: !!plot.ylabel,
          text: plot.ylabel || ''
        }
      }
    }
  };

  return (
    <div className="mw-panel h-full flex flex-col">
      {/* Panel Header */}
      <div className="mw-panel-header">
        <div className="flex items-center space-x-1">
          <LineChartIcon size={13} className="text-emerald-600" />
          <span>Figure 1: {plot.title || 'Untitled'}</span>
        </div>
        <div className="flex items-center space-x-1">
          <button onClick={onClear} title="Close Figure" className="hover:bg-gray-200 p-0.5 rounded text-gray-600">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Figure Actions Toolbar */}
      <div className="flex items-center space-x-2 px-3 py-1 bg-[#f8fafc] border-b border-[#e2e8f0] text-xs">
        <button className="flex items-center space-x-1 px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-[11px] text-gray-700">
          <GridIcon size={11} className="text-gray-500" />
          <span>Grid</span>
        </button>
        <button className="flex items-center space-x-1 px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-[11px] text-gray-700">
          <Download size={11} className="text-gray-500" />
          <span>Export</span>
        </button>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 p-3 bg-white min-h-[200px]">
        {plot.type === 'bar' ? (
          <Bar data={chartData} options={chartOptions} />
        ) : plot.type === 'scatter' ? (
          <Scatter data={chartData} options={chartOptions} />
        ) : (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>
    </div>
  );
};
