import { useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, X } from 'lucide-react';

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Capture before React mounts, including while the initial API request is loading.
let prompt: InstallPrompt | null = null;
const displayMode = window.matchMedia('(display-mode: standalone)');
let installed = displayMode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const listeners = new Set<() => void>();
let revision = 0;
const emit = () => { revision++; listeners.forEach(listener => listener()); };
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  prompt = event as InstallPrompt;
  emit();
});
window.addEventListener('appinstalled', () => { installed = true; prompt = null; emit(); });
displayMode.addEventListener('change', event => { if (event.matches) { installed = true; emit(); } });
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export default function InstallAppButton() {
  useSyncExternalStore(subscribe, () => revision);
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(navigator.userAgent);

  const install = async () => {
    if (installed || busy) return;
    const pending = prompt;
    if (!pending) { setMessage(''); dialog.current?.showModal(); return; }
    prompt = null;
    emit();
    setBusy(true);
    try {
      // Must be called directly during the click, before any asynchronous work.
      await pending.prompt();
      const choice = await pending.userChoice;
      setMessage(choice.outcome === 'accepted'
        ? 'Instalação solicitada! Aguarde a confirmação do aparelho e procure o ícone Rota Viva.'
        : 'Instalação cancelada. Você pode tentar novamente pelo menu do navegador.');
    } catch {
      setMessage('O navegador não abriu a instalação. Use as instruções abaixo para instalar pelo menu.');
    } finally {
      setBusy(false);
      if (!dialog.current?.open) dialog.current?.showModal();
    }
  };

  return <>
    <button className="nav-item install-button" disabled={installed || busy} onClick={install}>
      {installed ? <CheckCircle2 size={19} /> : <Download size={19} />}
      {installed ? 'Aplicativo instalado' : busy ? 'Aguardando instalação…' : 'Instalar aplicativo'}
    </button>
    {createPortal(<dialog ref={dialog} className="pwa-install-dialog" aria-labelledby="pwa-install-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="pwa-install-heading"><h2 id="pwa-install-title">{installed ? 'Aplicativo instalado' : 'Instalar Rota Viva'}</h2><button className="icon-button" aria-label="Fechar instalação" onClick={() => dialog.current?.close()}><X /></button></div>
      {message && <p role="status">{message}</p>}
      {installed ? <p>O Rota Viva está pronto para abrir pelo ícone no seu aparelho.</p> : <>
        <p>Tenha o Rota Viva na tela inicial e abra a aplicação como um app.</p>
        {!window.isSecureContext ? <p>Abra o endereço HTTPS publicado na Vercel para instalar no aparelho.</p> : ios ? <ol><li>Abra este site no Safari.</li><li>Toque em <strong>Compartilhar</strong> e em <strong>Adicionar à Tela de Início</strong>.</li><li>Se aparecer, ative <strong>Abrir como App da Web</strong> e toque em <strong>Adicionar</strong>.</li></ol> : <ol><li>Abra este site no {android ? 'Chrome' : 'Chrome ou Microsoft Edge'}.</li><li>No menu <strong>⋮</strong> ou <strong>…</strong>, escolha <strong>Instalar aplicativo</strong>{android ? ' ou Adicionar à tela inicial → Instalar' : ' (ou Aplicativos → Instalar este site como aplicativo)'}.</li><li>Confirme em <strong>Instalar</strong>.</li></ol>}
        {prompt && <button className="primary" disabled={busy} onClick={install}><Download size={18} />Instalar agora</button>}
        <p className="pwa-install-note">Se abriu pelo Instagram ou WhatsApp, use “Abrir no navegador”. A opção de instalação depende do navegador e pode não aparecer se o app já estiver instalado.</p>
      </>}
      <button className="secondary" onClick={() => dialog.current?.close()}>Entendi</button>
    </dialog>, document.body)}
  </>;
}
