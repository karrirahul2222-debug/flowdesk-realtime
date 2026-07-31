import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DashboardAudience, DashboardMetrics, MetricsRange } from '@/hooks/useDashboardMetrics'

const colors = ['#7487ff', '#3ab5a7', '#f2b35f', '#e76d7b', '#9b77d9', '#67a8ec']

const copy: Record<DashboardAudience, { status: string; completion: string; workload: string; time: string }> = {
  ceo: { status: 'Task status', completion: 'Weekly task completion', workload: 'Employee workload', time: 'Time tracked' },
  manager: { status: 'Team task status', completion: 'Team weekly completion', workload: 'Team workload', time: 'Team time tracked' },
  employee: { status: 'My task status', completion: 'My completed-task trend', workload: 'My workload', time: 'My daily time tracked' },
}

function RangeSelector({ range, onChange }: { range: MetricsRange; onChange: (range: MetricsRange) => void }) {
  return <div className="chart-range-selector" aria-label="Chart date range">
    {[7, 30].map((option) => <button key={option} className={range === option ? 'active' : ''} onClick={() => onChange(option as MetricsRange)}>{`Last ${option} days`}</button>)}
  </div>
}

function ChartEmpty({ message }: { message: string }) {
  return <div className="chart-empty" role="status">{message}</div>
}

function ChartSkeleton() {
  return <div className="chart-skeleton" aria-label="Loading dashboard chart" aria-busy="true"><i /><i /><i /><i /><i /></div>
}

export function DashboardMetricsCharts({
  audience,
  metrics,
  range,
  onRangeChange,
  loading,
  error,
  onRetry,
}: {
  audience: DashboardAudience
  metrics?: DashboardMetrics
  range: MetricsRange
  onRangeChange: (range: MetricsRange) => void
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  const labels = copy[audience]
  if (loading) return <section className="dashboard-grid dashboard-metrics-grid"><article className="panel chart-panel"><ChartSkeleton /></article><article className="panel chart-panel span-2"><ChartSkeleton /></article><article className="panel chart-panel"><ChartSkeleton /></article></section>
  if (error || !metrics) return <section className="dashboard-grid dashboard-metrics-grid"><article className="panel chart-panel span-3 chart-error"><h2>Charts are unavailable</h2><p>Live dashboard metrics could not be loaded. Your existing data has not been changed.</p><button className="secondary-button" onClick={onRetry}>Retry</button></article></section>

  const isEmpty = metrics.taskCount === 0
  const trendTitle = audience === 'employee' ? labels.completion : labels.completion
  const finalChartTitle = audience === 'employee' ? labels.time : labels.workload
  const finalData = audience === 'employee' ? metrics.timeTracked : metrics.workload
  const finalEmpty = audience === 'employee' ? !metrics.hasTimeEntries : metrics.workload.length === 0

  return <section className="dashboard-grid dashboard-metrics-grid">
    <article className="panel chart-panel">
      <div className="panel-heading"><div><h2 id="dashboard-status-chart">{labels.status}</h2><p>Current work by workflow state.</p></div></div>
      {isEmpty ? <ChartEmpty message="No tasks match this dashboard scope yet." /> : <><div className="donut-wrap" role="img" aria-labelledby="dashboard-status-chart"><ResponsiveContainer width="100%" height={205}><PieChart><Pie data={metrics.status} dataKey="value" nameKey="label" innerRadius={52} outerRadius={76} paddingAngle={3}>{metrics.status.map((item, index) => <Cell key={item.label} fill={colors[index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{metrics.taskCount}</strong><span>items</span></div></div><div className="chart-legend">{metrics.status.filter((item) => item.value > 0).map((item, index) => <span key={item.label}><i style={{ background: colors[index] }} />{item.label}<strong>{item.value}</strong></span>)}</div></>}
    </article>

    <article className="panel chart-panel span-2">
      <div className="panel-heading"><div><h2 id="dashboard-completion-chart">{trendTitle}</h2><p>Completed tasks by their most recent update.</p></div><RangeSelector range={range} onChange={onRangeChange} /></div>
      {isEmpty ? <ChartEmpty message="Complete tasks to see a live delivery trend." /> : <div className="chart-container" role="img" aria-labelledby="dashboard-completion-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={metrics.completionTrend}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={20} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} width={28} /><Tooltip /><Line type="monotone" dataKey="value" name="Completed tasks" stroke="#7487ff" strokeWidth={3} dot={false} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div>}
    </article>

    <article className="panel chart-panel">
      <div className="panel-heading"><div><h2 id="dashboard-workload-chart">{finalChartTitle}</h2><p>{audience === 'employee' ? 'Hours logged each day.' : 'Open assigned tasks by employee.'}</p></div>{audience === 'employee' && <RangeSelector range={range} onChange={onRangeChange} />}</div>
      {finalEmpty ? <ChartEmpty message={audience === 'employee' ? 'Log time to see your daily trend.' : 'Assign open tasks to see team workload.'} /> : <div className="chart-container" role="img" aria-labelledby="dashboard-workload-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={finalData} margin={{ left: -10 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={20} /><YAxis allowDecimals={audience === 'employee'} axisLine={false} tickLine={false} width={28} /><Tooltip /><Bar dataKey="value" name={audience === 'employee' ? 'Hours' : 'Open tasks'} fill="#3ab5a7" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div>}
    </article>
  </section>
}
