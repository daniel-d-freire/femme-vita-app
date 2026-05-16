import { Logo } from './Logo';

type Props = {
  error?: string;
};

export function LoginScreen({ error }: Props) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-bone">
      <header className="px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4">
        <Logo variant="dark" size="sm" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-navy/40">
          arquivo da clínica
        </p>
        <h1 className="mt-3 max-w-sm font-serif text-5xl italic leading-[1.05] text-navy">
          digitalize <br /> direto na pasta da paciente.
        </h1>
        <p className="mt-5 max-w-sm text-sm leading-relaxed text-navy/60">
          Conecte a conta Google que tem acesso à pasta <span className="font-mono text-[11px] tracking-wide">Apolo/</span> no Drive. O app vai listar as pacientes existentes, identificar nome+tipo do documento, e salvar como PDF na pasta certa.
        </p>

        <a
          href="/api/auth/google"
          className="mt-10 inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-navy px-7 font-mono text-[11px] tracking-wider uppercase text-bone shadow-lifted transition active:scale-[0.98]"
        >
          <GoogleMark />
          Entrar com Google
        </a>

        <ul className="mt-12 grid w-full max-w-sm gap-2 text-left">
          <Bullet>Lê o nome da paciente e o tipo do documento</Bullet>
          <Bullet>Encontra a pasta certa em <span className="font-mono">Apolo/</span></Bullet>
          <Bullet>Salva PDF nomeado no padrão automático</Bullet>
          <Bullet>Quando há dúvida, pede confirmação manual</Bullet>
        </ul>

        {error && (
          <div className="mt-8 max-w-sm rounded-xl border border-danger/30 bg-danger/8 p-3 text-left">
            <p className="font-mono text-[10px] tracking-wider uppercase text-danger">erro</p>
            <p className="mt-1 text-xs text-navy/80">{error}</p>
          </div>
        )}
      </div>

      <footer className="px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] text-center">
        <p className="font-mono text-[9px] tracking-[0.22em] uppercase text-navy/30">
          femme vita · arquivo
        </p>
      </footer>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-bone-50 p-3">
      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-amber" />
      <span className="text-sm leading-snug text-navy/80">{children}</span>
    </li>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M9 3.48c1.69 0 2.84.73 3.49 1.34l2.55-2.48C13.45.99 11.42 0 9 0 5.48 0 2.44 2.02.96 4.96l2.96 2.3C4.66 5.07 6.66 3.48 9 3.48z"/>
      <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#FBBC05" d="M3.92 10.71A5.43 5.43 0 0 1 3.63 9c0-.59.11-1.16.29-1.71L.96 4.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.96-2.33z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.34 0-4.34-1.59-5.05-3.78L.96 13.04C2.44 15.98 5.48 18 9 18z"/>
    </svg>
  );
}
