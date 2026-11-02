import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, Button, Checkbox, Field, Input, PageHeader, Spinner, useToast } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { IS_DEMO } from '@/lib/env'
import { friendlyError } from '@/lib/domain/errors'
import { passwordSchema } from '@/lib/domain/validators'
import { updatePassword } from '@/services/auth'
import { getPrefs, setPref } from '@/services/notifications'
import { updateMyProfile } from '@/services/organizations'

const TYPES: [string, string][] = [['invitation', 'Convites para pedidos'], ['deadline_near', 'Prazos a terminar'], ['deadline_extended', 'Prorrogações de prazo'], ['document_expiring', 'Documentos a expirar'], ['document_expired', 'Documentos expirados'], ['document_approved', 'Resultado de análise de documentos'], ['proposal_received', 'Propostas recebidas'], ['decision', 'Decisões comerciais'], ['clarification_asked', 'Pedidos de esclarecimento']]

export default function Settings() {
  const a = useAuth(), qc = useQueryClient(), toast = useToast()
  const p = a.ctx!.profile
  const [name, setName] = useState(p.full_name), [phone, setPhone] = useState(p.phone ?? ''), [job, setJob] = useState(p.job_title ?? '')
  const [pw, setPw] = useState(''), [pwErr, setPwErr] = useState<string>()
  const prefs = useQuery({ queryKey: ['prefs', p.id], queryFn: () => getPrefs(p.id) })
  const save = useMutation({ mutationFn: () => updateMyProfile(p.id, { full_name: name.trim(), phone: phone || null, job_title: job || null }), onSuccess: () => { toast.success('Dados guardados.'); a.refresh() }, onError: (e) => toast.error(friendlyError(e)) })
  const pwm = useMutation({ mutationFn: () => updatePassword(pw), onSuccess: () => { toast.success('Palavra-passe actualizada.'); setPw('') }, onError: (e) => setPwErr(friendlyError(e)) })
  const pref = useMutation({ mutationFn: ({ t, inApp }: { t: string; inApp: boolean }) => setPref(p.id, t, inApp, false), onSuccess: () => qc.invalidateQueries({ queryKey: ['prefs'] }), onError: (e) => toast.error(friendlyError(e)) })
  const on = (t: string) => prefs.data?.find((x) => x.type === t)?.in_app ?? true
  return (
    <>
      <PageHeader title="Definições da conta" />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="card card-pad space-y-4"><h2 className="section-title">Dados pessoais</h2>
          <Field label="Nome completo" required>{(i) => <Input id={i} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="E-mail" hint="O e-mail é o identificador da conta.">{(i) => <Input id={i} value={a.email ?? ''} disabled />}</Field>
          <Field label="Telefone">{(i) => <Input id={i} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
          <Field label="Cargo">{(i) => <Input id={i} value={job} onChange={(e) => setJob(e.target.value)} />}</Field>
          <Button loading={save.isPending} disabled={name.trim().length < 3} onClick={() => save.mutate()}>Guardar</Button></section>
        <section className="card card-pad space-y-4"><h2 className="section-title">Segurança</h2>
          {IS_DEMO ? <Alert tone="warn">A alteração de palavra-passe não está disponível nesta instalação.</Alert> : <>
            {pwErr && <Alert tone="danger">{pwErr}</Alert>}
            <Field label="Nova palavra-passe" hint="Mínimo de 10 caracteres, com letras e números.">{(i) => <Input id={i} type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setPwErr(undefined) }} />}</Field>
            <Button loading={pwm.isPending} disabled={!passwordSchema.safeParse(pw).success} onClick={() => pwm.mutate()}>Alterar palavra-passe</Button></>}
          <hr className="border-line" /><Button variant="secondary" onClick={() => a.signOut()}>Terminar sessão</Button></section>
        <section className="card card-pad lg:col-span-2"><h2 className="section-title">Notificações</h2>
          <div className="my-3"><Alert tone="info">As notificações dentro da plataforma estão activas. O envio por e-mail <strong>ainda não está activo</strong>: depende da configuração de um serviço de e-mail (ver README).</Alert></div>
          {prefs.isLoading ? <Spinner /> : <ul className="grid gap-3 sm:grid-cols-2">{TYPES.map(([t, l]) => <li key={t}><Checkbox label={l} checked={on(t)} onChange={(e) => pref.mutate({ t, inApp: e.target.checked })} /></li>)}</ul>}</section>
      </div>
    </>
  )
}
