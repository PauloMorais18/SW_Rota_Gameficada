'use client';
import { useState } from 'react';
import { ArrowRight, Compass, ShieldCheck, Store, Eye, EyeOff } from 'lucide-react';

const accounts = [
  { label: 'Visitante', role: 'VISITANTE', icon: Compass },
  { label: 'Estabelecimento', role: 'ESTABELECIMENTO', icon: Store },
  { label: 'Admin', role: 'ADMIN', icon: ShieldCheck },
];

export default function AuthForm({ busy, demo, googleEnabled, onSubmit }: { busy: boolean; demo: boolean; googleEnabled: boolean; onSubmit: (action: string, payload: Record<string, unknown>) => void }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selected, setSelected] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  return <>
    <p className="muted">Encontre novos lugares e faça parte de uma cidade mais conectada.</p>
    <div className="auth-tabs"><button className={!register ? 'selected' : ''} onClick={() => setRegister(false)}>Entrar</button><button className={register ? 'selected' : ''} onClick={() => { setRegister(true); setEmail(''); setPassword(''); setSelected(''); }}>Criar conta</button></div>
    {!register && demo && <div className="login-shortcuts"><span className="shortcut-label">EXPERIMENTE COM UM PERFIL</span><div className="shortcut-options">{accounts.map(({ label, role, icon: Icon }) => <button key={role} type="button" disabled={busy} aria-pressed={selected === role} className={selected === role ? 'selected' : ''} onClick={() => { setSelected(role); onSubmit('demo', { role }); }}><Icon size={19} />{label}</button>)}</div><p>Selecione para acessar uma conta de teste.</p></div>}
    <form onSubmit={event => { event.preventDefault(); onSubmit(register ? 'register' : 'login', Object.fromEntries(new FormData(event.currentTarget))); }}>
      {register && <label className="field">Seu nome<input name="name" autoComplete="name" required /></label>}
      <label className="field">E-mail<input name="email" type="email" autoComplete="email" required value={email} onChange={event => { setEmail(event.target.value); setSelected(''); }} /></label>
      <div className="field"><label htmlFor="auth-password">Senha</label><div className="password-control"><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={8} maxLength={72} placeholder="No mínimo 8 caracteres" required value={password} onChange={event => { setPassword(event.target.value); setSelected(''); }} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></div>
      {register && <label className="field">Quero participar como<select name="role"><option value="VISITANTE">Visitante • explorar a cidade</option><option value="ESTABELECIMENTO">Estabelecimento • divulgar meu negócio</option></select></label>}
      <button className="primary full" disabled={busy}>{busy ? 'Aguarde…' : register ? 'Criar minha conta' : 'Entrar na minha conta'}<ArrowRight size={17} /></button>
    </form>
    <div className="oauth-divider">ou</div><button className="secondary full google-login" type="button" disabled={busy || !googleEnabled} onClick={() => { window.location.href = '/api/google?start=1'; }}><span aria-hidden="true">G</span>Continuar com Google</button>{!googleEnabled && <p className="muted">Acesso com Google aguardando configuração.</p>}
  </>;
}
