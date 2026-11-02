import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface Datum { name: string; value: number; color?: string }
const COLORS = ['#1D56C9', '#FFC107', '#0A1E45', '#15803D', '#B45309', '#B91C1C', '#5B6A86']

/** Gráfico de barras com tabela equivalente para leitores de ecrã. */
export function BarsCard({ title, data, hint }: { title: string; data: Datum[]; hint?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <section className="card card-pad" aria-label={title}>
      <h3 className="section-title !text-base">{title}</h3>
      {hint && <p className="hint mb-2">{hint}</p>}
      {total === 0 ? <p className="py-8 text-center text-sm text-ink-mute">Sem dados disponíveis</p> : (
        <>
          <div className="mt-2 h-56" role="img" aria-label={`${title}: ${data.map((d) => `${d.name} ${d.value}`).join('; ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#E7ECF2" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#4B5A6E' }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: '#263241' }} />
                <Tooltip cursor={{ fill: '#F3F6FA' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {data.map((d, i) => <Cell key={d.name} fill={d.color ?? COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only"><caption>{title}</caption><tbody>{data.map((d) => <tr key={d.name}><th scope="row">{d.name}</th><td>{d.value}</td></tr>)}</tbody></table>
        </>
      )}
    </section>
  )
}

/** Linha «Actividade dos últimos 30 dias» a partir de datas ISO (contagem diária). */
export function ActivityLine({ title, dates, label = 'Eventos' }: { title: string; dates: (string | null | undefined)[]; label?: string }) {
  const days: { d: string; v: number }[] = []
  for (let i = 29; i >= 0; i--) { const t = new Date(Date.now() - i * 86_400_000); days.push({ d: t.toISOString().slice(0, 10), v: 0 }) }
  for (const x of dates) { const k = x?.slice(0, 10); const row = days.find((r) => r.d === k); if (row) row.v++ }
  const total = days.reduce((a, r) => a + r.v, 0)
  const data = days.map((r) => ({ name: `${r.d.slice(8, 10)}/${r.d.slice(5, 7)}`, value: r.v }))
  return (
    <section className="card card-pad" aria-label={title}>
      <h3 className="section-title !text-base">{title}</h3>
      {total === 0 ? <p className="py-10 text-center text-sm text-ink-mute">Sem actividade neste período</p> : (
        <>
          <div className="mt-2 h-52" role="img" aria-label={`${title}: ${total} ${label.toLowerCase()} em 30 dias`}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ left: -18, right: 8, top: 8 }}><CartesianGrid vertical={false} stroke="#E7ECF5" /><XAxis dataKey="name" interval={4} tick={{ fontSize: 11, fill: '#475775' }} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475775' }} /><Tooltip /><Line type="monotone" dataKey="value" name={label} stroke="#1D56C9" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
          </div>
          <table className="sr-only"><caption>{title}</caption><tbody>{data.filter((r) => r.value).map((r) => <tr key={r.name}><th scope="row">{r.name}</th><td>{r.value}</td></tr>)}</tbody></table>
        </>
      )}
    </section>
  )
}
