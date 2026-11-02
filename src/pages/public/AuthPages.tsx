import { zodResolver } from '@hookform/resolvers/zod'
import { FlaskConical, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { z } from 'zod'
import { RigScene } from '@/assets/RigScene'
import { Alert, Button, Checkbox, Field, Input, Logo, Select } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { IS_DEMO } from '@/lib/env'
import { DEMO_ACCOUNTS } from '@/lib/demo/client'
import { PROVINCES } from '@/lib/domain/labels'
import { friendlyError } from '@/lib/domain/errors'
import { loginSchema, passwordSchema, registerSchema } from '@/lib/domain/validators'
import { register as doRegister, requestPasswordReset, signIn, updatePassword } from '@/services/auth'

function AuthShell({ title, subtitle, children, wide, split }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean; split?: boolean }) {
  const card = (
    <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
      <Link to="/" aria-label="Página inicial" className="mb-6 inline-block"><Logo size={42} /></Link>
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mb-6 mt-1 text-ink-soft">{subtitle}</p>}
      {children}
    </div>
  )
  if (split) return (
    <div className="grid min-h-[calc(100vh-68px)] lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block"><RigScene className="absolute inset-0 h-full w-full" /><div className="absolute inset-0 bg-gradient-to-t from-navy-900/90 via-transparent to-transparent" aria-hidden />
        <p className="absolute bottom-12 left-10 max-w-sm font-display text-[34px] font-bold leading-tight text-white">Juntos construímos <span className="text-gold">mais oportunidades.</span></p></div>
      <div className="flex items-start justify-center bg-white px-6 py-12 sm:px-10 lg:items-center">{card}</div>
    </div>
  )
  return (
    <div className="bg-surface"><div className="mx-auto flex min-h-[calc(100vh-68px)] max-w-7xl items-start justify-center px-4 py-10 sm:px-6 sm:py-14"><div className="card w-full p-6 sm:p-8" style={{ maxWidth: wide ? 768 : 448 }}>{card}</div></div></div>
  )
}

export function Login() {
  const nav = useNavigate()
  const loc = useLocation()
  const { authenticated, loading } = useAuth()
  const [error, setError] = useState<string>()
  const f = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) })
  if (!loading && authenticated) return <Navigate to={(loc.state as { from?: string })?.from ?? '/app'} replace />
  const go = async (email: string, password: string) => {
    setError(undefined)
    try { await signIn(email, password); nav((loc.state as { from?: string })?.from ?? '/app', { replace: true }) } catch (e) { setError(friendlyError(e)) }
  }
  return (
    <AuthShell split title="Bem-vindo(a)!" subtitle="Faça login para continuar.">
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <form onSubmit={f.handleSubmit((v) => go(v.email, v.password))} noValidate className="space-y-4">
        <Field label="E-mail" error={f.formState.errors.email?.message} required>{(id, d) => <Input id={id} type="email" autoComplete="email" aria-describedby={d} {...f.register('email')} />}</Field>
        <Field label="Palavra-passe" error={f.formState.errors.password?.message} required>{(id, d) => <Input id={id} type="password" autoComplete="current-password" aria-describedby={d} {...f.register('password')} />}</Field>
        <Button type="submit" className="w-full !min-h-[46px]" loading={f.formState.isSubmitting}>Entrar</Button>
      </form>
      <p className="mt-4 text-center text-sm"><Link to="/recuperar-palavra-passe" className="kbd-link">Esqueci-me da palavra-passe</Link></p>
      <p className="mt-2 text-center text-sm text-ink-soft">Ainda não tem conta? <Link to="/registar" className="kbd-link">Registar empresa</Link></p>
      {IS_DEMO && (
        <div className="mt-6 rounded-card border border-line bg-surface p-4">
          <p className="flex items-center gap-2 font-display font-semibold text-navy"><FlaskConical className="h-4 w-4" aria-hidden />Contas de teste</p>
          <p className="mb-3 mt-1 text-sm text-ink-soft">Escolha uma conta para entrar. Não é pedida palavra-passe.</p>
          <div className="space-y-3">{[...new Set(DEMO_ACCOUNTS.map((a) => a.group))].map((g) => (
            <div key={g}><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-mute">{g}</p>
              <ul className="space-y-1.5">{DEMO_ACCOUNTS.filter((a) => a.group === g).map((a) => (
                <li key={a.email}><button type="button" onClick={() => go(a.email, 'demo')} className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-left text-sm hover:border-brand"><span className="font-semibold text-navy">{a.name}</span><span className="text-xs text-ink-mute">{a.role}</span></button></li>))}</ul></div>))}</div>
        </div>
      )}
    </AuthShell>
  )
}

type RegForm = z.input<typeof registerSchema>
export function Register() {
  const nav = useNavigate()
  const [error, setError] = useState<string>()
  const [confirm, setConfirm] = useState(false)
  const f = useForm<RegForm>({ resolver: zodResolver(registerSchema), defaultValues: { org_type: 'supplier', province: '', accept: false as unknown as true } })
  const e = f.formState.errors
  const submit = async (v: RegForm) => {
    setError(undefined)
    try {
      const r = await doRegister({ ...(v as z.output<typeof registerSchema>) })
      if (r.needsEmailConfirmation) setConfirm(true); else nav('/app/empresa', { replace: true })
    } catch (err) { setError(friendlyError(err)) }
  }
  if (confirm) return (
    <AuthShell title="Confirme o seu e-mail">
      <div className="text-center"><MailCheck className="mx-auto h-12 w-12 text-brand" aria-hidden /><p className="mt-3 text-[15px] text-ink">Enviámos uma mensagem de confirmação para <strong>{f.getValues('email')}</strong>. Depois de confirmar, inicie sessão — a sua empresa será criada automaticamente.</p><Link to="/entrar" className="btn-primary mt-5">Ir para o início de sessão</Link></div>
    </AuthShell>
  )
  return (
    <AuthShell wide title="Registo de Empresa" subtitle="Preencha os dados da sua empresa para começar. Poderá completar o perfil e os documentos depois.">
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <form onSubmit={f.handleSubmit(submit)} noValidate className="space-y-8">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="section-title mb-3">A sua conta</legend>
          <Field label="Nome completo" error={e.full_name?.message} required className="sm:col-span-2">{(id, d) => <Input id={id} autoComplete="name" aria-describedby={d} {...f.register('full_name')} />}</Field>
          <Field label="E-mail profissional" error={e.email?.message} required className="sm:col-span-2">{(id, d) => <Input id={id} type="email" autoComplete="email" aria-describedby={d} {...f.register('email')} />}</Field>
          <Field label="Palavra-passe" error={e.password?.message} hint="Mínimo de 10 caracteres, com letras e números." required>{(id, d) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} {...f.register('password')} />}</Field>
          <Field label="Confirmar palavra-passe" error={e.confirm?.message} required>{(id, d) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} {...f.register('confirm')} />}</Field>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="section-title mb-3">A sua empresa</legend>
          <Field label="Nome legal" error={e.legal_name?.message} required>{(id, d) => <Input id={id} aria-describedby={d} {...f.register('legal_name')} />}</Field>
          <Field label="Nome comercial" error={e.trade_name?.message}>{(id) => <Input id={id} {...f.register('trade_name')} />}</Field>
          <Field label="NIF" error={e.nif?.message} hint="10 dígitos." required>{(id, d) => <Input id={id} inputMode="numeric" aria-describedby={d} {...f.register('nif')} />}</Field>
          <Field label="Tipo de organização" error={e.org_type?.message} required>{(id) => <Select id={id} {...f.register('org_type')}><option value="supplier">Fornecedor</option><option value="buyer">Empresa compradora</option><option value="both">Fornecedor e comprador</option></Select>}</Field>
          <Field label="Sector de actividade" error={e.sector?.message} required>{(id, d) => <Input id={id} aria-describedby={d} {...f.register('sector')} />}</Field>
          <Field label="Telefone" error={e.phone?.message} required>{(id, d) => <Input id={id} type="tel" autoComplete="tel" aria-describedby={d} {...f.register('phone')} />}</Field>
          <Field label="Província" error={e.province?.message} required>{(id, d) => <Select id={id} aria-describedby={d} {...f.register('province')}><option value="">Seleccione…</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select>}</Field>
          <Field label="Município" error={e.municipality?.message} required>{(id, d) => <Input id={id} aria-describedby={d} {...f.register('municipality')} />}</Field>
        </fieldset>
        <div>
          <Checkbox label={<>Li e aceito os <Link to="/termos" className="kbd-link" target="_blank">Termos de utilização</Link> e a <Link to="/privacidade" className="kbd-link" target="_blank">Política de privacidade</Link>.</>} {...f.register('accept')} />
          {e.accept && <p role="alert" className="field-error">{e.accept.message}</p>}
        </div>
        <Button type="submit" className="w-full sm:w-auto" loading={f.formState.isSubmitting}>Criar conta e empresa</Button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">Já tem conta? <Link to="/entrar" className="kbd-link">Entrar</Link></p>
    </AuthShell>
  )
}

export function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string>()
  const f = useForm<{ email: string }>({ resolver: zodResolver(loginSchema.pick({ email: true })) })
  return (
    <AuthShell title="Recuperar palavra-passe" subtitle="Indique o e-mail da sua conta para receber uma ligação de recuperação.">
      {sent ? <Alert tone="ok" title="Pedido registado">Se existir uma conta com esse e-mail, receberá instruções em breve.</Alert> : (
        <form noValidate className="space-y-4" onSubmit={f.handleSubmit(async (v) => { try { await requestPasswordReset(v.email); setSent(true) } catch (e) { setError(friendlyError(e)) } })}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="E-mail" error={f.formState.errors.email?.message} required>{(id, d) => <Input id={id} type="email" aria-describedby={d} {...f.register('email')} />}</Field>
          <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Enviar ligação</Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm"><Link to="/entrar" className="kbd-link">← Voltar a entrar</Link></p>
    </AuthShell>
  )
}

export function ResetPassword() {
  const nav = useNavigate()
  const [error, setError] = useState<string>()
  const f = useForm<{ password: string }>()
  return (
    <AuthShell title="Definir nova palavra-passe">
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <form noValidate className="space-y-4" onSubmit={f.handleSubmit(async (v) => {
        const r = passwordSchema.safeParse(v.password)
        if (!r.success) { f.setError('password', { message: r.error.issues[0].message }); return }
        try { await updatePassword(v.password); nav('/app', { replace: true }) } catch (e) { setError(friendlyError(e)) }
      })}>
        <Field label="Nova palavra-passe" error={f.formState.errors.password?.message} hint="Mínimo de 10 caracteres, com letras e números." required>{(id, d) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} {...f.register('password')} />}</Field>
        <Button type="submit" className="w-full" loading={f.formState.isSubmitting}>Guardar</Button>
      </form>
    </AuthShell>
  )
}
