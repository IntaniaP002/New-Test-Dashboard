import React, { useMemo, useState } from 'react';
import {
  Calendar,
  RotateCcw,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { OperationalRecord, ThresholdConfig } from '../types';

interface PerformanceTrendViewProps {
  records: OperationalRecord[];
  thresholds: ThresholdConfig;
}

type TabSelection = 'all' | 'index' | 'nphr' | 'pr' | 'p3' | 'power';

export const PerformanceTrendView: React.FC<PerformanceTrendViewProps> = ({
  records,
  thresholds,
}) => {
  const [activeMetric, setActiveMetric] = useState<TabSelection>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Date filtered records
  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        if (startDate && r.date < startDate) return false;
        if (endDate && r.date > endDate) return false;
        return true;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [records, startDate, endDate]);

  const chartData = useMemo(() => {
    return filteredRecords.map((r) => ({
      date: r.date,
      time: r.time,
      displayLabel: `${r.date} ${r.time ? r.time.slice(0, 5) : ''}`.trim(),
      performanceIndex: r.performanceIndex,
      nphrDeterioration: r.nphrDeterioration,
      prDeterioration: r.prDeterioration,
      p3Deterioration: r.p3Deterioration,
      powerDeterioration: r.powerDeterioration,
      nphr: r.nphr,
      pr: r.pr,
      p3: r.P3_0,
      power: r.realPower,
      isWW: r.isWaterWashEvent,
    }));
  }, [filteredRecords]);

  const handleResetDates = () => {
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-6">
      {/* Header & Date Filter */}
      <div className="bg-white rounded-md border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">Performance Trend</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor parameter deterioration trends approaching the Water Washing thresholds
          </p>
        </div>

        {/* Date Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Start Date"
              className="bg-transparent text-xs text-slate-800 focus:outline-hidden"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="End Date"
              className="bg-transparent text-xs text-slate-800 focus:outline-hidden"
            />
          </div>

          {(startDate || endDate) && (
            <button
              type="button"
              onClick={handleResetDates}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded"
              title="Reset date filter"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Metric Selector Pills */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'all', label: 'All Indicators' },
          { id: 'index', label: 'Performance Index (30/30/20/20)' },
          { id: 'nphr', label: 'NPHR (Heat Rate)' },
          { id: 'pr', label: 'PR (Pressure Ratio)' },
          { id: 'p3', label: 'P3.0 (Discharge Pressure)' },
          { id: 'power', label: 'Real Power (Output)' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveMetric(item.id as TabSelection)}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              activeMetric === item.id
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {chartData.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-md text-xs text-slate-500">
          No records match the selected date range. Try clearing or expanding the date filter.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Chart Card */}
          <div className="bg-white rounded-md border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {activeMetric === 'all' && 'Combined Parameter Deterioration (%)'}
                  {activeMetric === 'index' && 'Weighted Performance Index (%)'}
                  {activeMetric === 'nphr' && 'NPHR Deterioration (%)'}
                  {activeMetric === 'pr' && 'PR Deterioration (%)'}
                  {activeMetric === 'p3' && 'P3.0 Deterioration (%)'}
                  {activeMetric === 'power' && 'Real Power Deterioration (%)'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeMetric === 'index'
                    ? 'Composite index: 50% threshold for Pantau / Monitoring, 80% threshold for Water Wash recommendation'
                    : 'Reference lines indicate Water Washing thresholds (solid/dashed)'}
                </p>
              </div>
              <span className="text-xs text-slate-500">
                {chartData.length} data points
              </span>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={{ stroke: '#cbd5e1' }}
                    unit="%"
                    domain={[0, activeMetric === 'index' ? 100 : 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    labelFormatter={(val, payload) => {
                      if (payload && payload[0]) {
                        const pt = payload[0].payload;
                        return `${pt.date} ${pt.time || ''}`;
                      }
                      return String(val);
                    }}
                    formatter={(value: any, name: any) => {
                      if (value === null || value === undefined) return ['N/A', name];
                      const num = Number(value);
                      return [`${num > 0 ? '+' : ''}${num.toFixed(2)}%`, name];
                    }}
                  />
                  <Legend
                    iconType="plainline"
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  />

                  {/* Performance Index Tab Line */}
                  {activeMetric === 'index' && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="performanceIndex"
                        name="Performance Index (%)"
                        stroke="#7c3aed"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                        connectNulls
                      />
                      <ReferenceLine
                        y={80}
                        stroke="#dc2626"
                        strokeDasharray="4 4"
                        label={{
                          value: 'WW Threshold: 80%',
                          fill: '#dc2626',
                          fontSize: 10,
                          position: 'insideTopRight',
                        }}
                      />
                      <ReferenceLine
                        y={50}
                        stroke="#d97706"
                        strokeDasharray="3 3"
                        label={{
                          value: 'Pantau Boundary: 50%',
                          fill: '#d97706',
                          fontSize: 10,
                          position: 'insideBottomRight',
                        }}
                      />
                    </>
                  )}

                  {/* NPHR Line & Thresholds */}
                  {(activeMetric === 'all' || activeMetric === 'nphr') && (
                    <Line
                      type="monotone"
                      dataKey="nphrDeterioration"
                      name="NPHR Det. (%)"
                      stroke="#d97706"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                      connectNulls
                    />
                  )}
                  {(activeMetric === 'all' || activeMetric === 'nphr') && (
                    <ReferenceLine
                      y={thresholds.nphrWWThreshold}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                      label={{
                        value: `NPHR Limit: ${thresholds.nphrWWThreshold}%`,
                        fill: '#dc2626',
                        fontSize: 10,
                        position: 'insideTopRight',
                      }}
                    />
                  )}
                  {(activeMetric === 'all' || activeMetric === 'nphr') && (
                    <ReferenceLine
                      y={thresholds.nphrEarlyMonitoring}
                      stroke="#0284c7"
                      strokeDasharray="2 2"
                      label={{
                        value: `NPHR Early: ${thresholds.nphrEarlyMonitoring}%`,
                        fill: '#0284c7',
                        fontSize: 10,
                        position: 'insideBottomRight',
                      }}
                    />
                  )}

                  {/* PR Line & Thresholds */}
                  {(activeMetric === 'all' || activeMetric === 'pr') && (
                    <Line
                      type="monotone"
                      dataKey="prDeterioration"
                      name="PR Det. (%)"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                      connectNulls
                    />
                  )}
                  {activeMetric === 'pr' && (
                    <ReferenceLine
                      y={thresholds.prWWThreshold}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                      label={{
                        value: `PR Limit: ${thresholds.prWWThreshold}%`,
                        fill: '#dc2626',
                        fontSize: 10,
                        position: 'insideTopRight',
                      }}
                    />
                  )}

                  {/* P3.0 Line & Thresholds */}
                  {(activeMetric === 'all' || activeMetric === 'p3') && (
                    <Line
                      type="monotone"
                      dataKey="p3Deterioration"
                      name="P3.0 Det. (%)"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                      connectNulls
                    />
                  )}
                  {activeMetric === 'p3' && (
                    <ReferenceLine
                      y={thresholds.p3WWThreshold}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                      label={{
                        value: `P3.0 Limit: ${thresholds.p3WWThreshold}%`,
                        fill: '#dc2626',
                        fontSize: 10,
                        position: 'insideTopRight',
                      }}
                    />
                  )}

                  {/* Real Power Line & Thresholds */}
                  {(activeMetric === 'all' || activeMetric === 'power') && (
                    <Line
                      type="monotone"
                      dataKey="powerDeterioration"
                      name="Real Power Det. (%)"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff' }}
                      connectNulls
                    />
                  )}
                  {activeMetric === 'power' && (
                    <ReferenceLine
                      y={thresholds.powerWWThreshold}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                      label={{
                        value: `Power Limit: ${thresholds.powerWWThreshold}%`,
                        fill: '#dc2626',
                        fontSize: 10,
                        position: 'insideTopRight',
                      }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4 Dedicated Parameter Mini Summaries */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-md border border-slate-200">
              <div className="text-xs font-bold text-slate-800">NPHR Threshold</div>
              <div className="text-lg font-extrabold text-slate-900 mt-1">{thresholds.nphrWWThreshold}%</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Early monitoring boundary at {thresholds.nphrEarlyMonitoring}%
              </div>
            </div>

            <div className="bg-white p-4 rounded-md border border-slate-200">
              <div className="text-xs font-bold text-slate-800">PR Threshold</div>
              <div className="text-lg font-extrabold text-slate-900 mt-1">{thresholds.prWWThreshold}%</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Compressor pressure ratio loss
              </div>
            </div>

            <div className="bg-white p-4 rounded-md border border-slate-200">
              <div className="text-xs font-bold text-slate-800">P3.0 Threshold</div>
              <div className="text-lg font-extrabold text-slate-900 mt-1">{thresholds.p3WWThreshold}%</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Discharge pressure drop limit
              </div>
            </div>

            <div className="bg-white p-4 rounded-md border border-slate-200">
              <div className="text-xs font-bold text-slate-800">Real Power Threshold</div>
              <div className="text-lg font-extrabold text-slate-900 mt-1">{thresholds.powerWWThreshold}%</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Turbine generator output loss limit
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
