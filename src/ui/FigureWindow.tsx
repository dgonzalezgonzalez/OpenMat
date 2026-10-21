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
  // The Grid and Export toolbar actions need local state, so the component
  // body cannot short-circuit before the hooks are declared.
  const [gridOverride, setGridOverride] = React.useState<boolean | null>(null);
  const [exportNote, setExportNote] = React.useState<string | null>(null);

  if (!plot || plot.series.length === 0) {
    return (
      <div className="om-panel h-full flex flex-col">
        <div className="om-panel-header">
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

  const gridVisible = gridOverride !== null ? gridOverride : plot.grid !== false;

  const chartData = {
    datasets: plot.series.map((s) => ({
      label: s.label,
      data: s.x.map((xVal, i) => ({ x: xVal, y: s.y[i] })),
      borderColor: s.color || '#0072BD',
      backgroundColor: s.color || '#0072BD',
      showLine: plot.type === 'line' || plot.type === 'histogram',
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
          display: gridVisible,
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
          display: gridVisible,
          color: '#e5e7eb'
        },
        title: {
          display: !!plot.ylabel,
          text: plot.ylabel || ''
        }
      }
    }
  };

  /**
   * Export the figure as a PNG image.
   *
   * Chart.js renders into a canvas, so the canvas pixels are downloaded
   * directly. `toDataURL` is used rather than `toBlob` because the latter
   * is asynchronous and would need an object URL to be revoked.
   */
  const handleExport = () => {
    const canvas = document.querySelector('.om-panel canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      setExportNote('No chart to export.');
      return;
    }
    try {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(plot.title || 'figure').replace(/[^\w.-]+/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExportNote('Exported PNG.');
    } catch (err) {
      setExportNote(`Export failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="om-panel h-full flex flex-col">
      {/* Panel Header */}
      <div className="om-panel-header">
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
        <button
          onClick={() => setGridOverride(!gridVisible)}
          title="Toggle grid"
          className={`flex items-center space-x-1 px-2 py-0.5 bg-white border rounded hover:bg-gray-50 text-[11px] text-gray-700 ${
            gridVisible ? 'border-gray-300' : 'border-gray-400 bg-gray-100'
          }`}
        >
          <GridIcon size={11} className="text-gray-500" />
          <span>Grid</span>
        </button>
        <button
          onClick={handleExport}
          title="Export figure as PNG"
          className="flex items-center space-x-1 px-2 py-0.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-[11px] text-gray-700"
        >
          <Download size={11} className="text-gray-500" />
          <span>Export</span>
        </button>
        {exportNote && <span className="text-[10px] text-gray-500">{exportNote}</span>}
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 p-3 bg-white min-h-[200px]">
        {plot.type === 'bar' || plot.type === 'histogram' ? (
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
