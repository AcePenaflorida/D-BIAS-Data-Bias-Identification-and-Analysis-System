/* PlotlyFigure: renders a plotly JSON figure returned from the backend.
  Requires dependency install: npm install react-plotly.js plotly.js-dist-min */
import Plot from 'react-plotly.js';

interface PlotlyFigureProps {
  figure?: any | null;
  title?: string;
}

export function PlotlyFigure({ figure, title }: PlotlyFigureProps) {
  if (!figure || !figure.plotly) {
    return null;
  }
  return (
    <div className="w-full">
      {title && <h3 className="text-slate-900 mb-4">{title}</h3>}
      <Plot
        data={figure.plotly.data}
        layout={{
          ...(figure.plotly.layout || {}),
          autosize: true,
          paper_bgcolor: 'white',
          plot_bgcolor: 'white',
          margin: { t: 30, r: 20, b: 40, l: 50, ...((figure.plotly.layout && figure.plotly.layout.margin) || {}) },
        }}
        config={{ displayModeBar: false, responsive: true }}
        useResizeHandler
        style={{ width: '100%', height: '360px' }}
      />
    </div>
  );
}
