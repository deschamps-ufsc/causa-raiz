import { useUsina } from '../hooks/UsinaContext'
import SeriesMapImport from '../components/SeriesMapImport'

export default function MappingPage() {
  const { usinaAtual } = useUsina()

  // Guard: usina não selecionada
  if (!usinaAtual) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 60px)',
        background: 'var(--bg-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16, padding: '40px 20px',
        color: 'var(--text-secondary)', textAlign: 'center',
      }}>
        <span style={{ fontSize: 56 }}>🏭</span>
        <strong style={{ fontSize: 20, color: 'var(--text-primary)' }}>Nenhuma usina selecionada</strong>
        <p style={{ fontSize: 14 }}>Selecione ou crie uma usina no menu superior para continuar.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--gradient-solar)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>🗂️</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>
              Mapeamento DE-PARA
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Usina: <strong style={{ color: 'var(--amber)' }}>{usinaAtual}</strong> · Importe o Excel que vincula cada série temporal ao seu Elemento e hierarquia da usina.
            </p>
          </div>
        </div>
      </div>

      {/* Como funciona */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">📌 Como funciona</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { n: '1', icon: '📥', title: 'Baixe o template', desc: 'Template vazio sugerindo o formato das colunas' },
            { n: '2', icon: '✏️', title: 'Preencha o DE-PARA', desc: 'Vincule cada coluna ao Elemento, SKID, Inversor e Stringbox' },
            { n: '3', icon: '🚀', title: 'Importe de volta', desc: 'As séries ficam classificadas e filtráveis no dashboard' },
          ].map((step) => (
            <div key={step.n} style={{
              background: 'var(--bg-secondary)', borderRadius: 'var(--r-lg)',
              padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--amber)', color: '#000',
                  fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{step.n}</span>
                <span style={{ fontSize: 18 }}>{step.icon}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{step.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Importador */}
      <div className="card">
        <div className="card-title">📥 Importar DE-PARA</div>
        <SeriesMapImport usina={usinaAtual} />
      </div>
    </div>
  )
}
