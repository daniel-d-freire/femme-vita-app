import { Logo } from './Logo';

const STEPS = [
  'Comprimindo imagens',
  'Enviando ao Claude',
  'Lendo o documento',
  'Identificando paciente',
];

export function ProcessingScreen({ pageCount }: { pageCount: number }) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-bone">
      <header className="px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4">
        <Logo variant="dark" size="sm" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-10">
          <div className="h-24 w-24 animate-spin rounded-full border-2 border-navy/10 border-t-amber" />
          <div className="absolute inset-3 grid place-items-center rounded-full bg-bone-50 shadow-soft">
            <span className="font-serif text-3xl italic text-navy">
              {String(pageCount).padStart(2, '0')}
            </span>
          </div>
        </div>

        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-navy/40">
          processando
        </p>
        <h1 className="mt-2 max-w-xs font-serif text-4xl italic leading-tight text-navy">
          analisando o documento
        </h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-navy/60">
          A IA está lendo o nome da paciente e identificando o tipo. Costuma levar 3 a 6 segundos.
        </p>

        <ul className="mt-10 flex flex-col gap-2.5">
          {STEPS.map((step, idx) => (
            <li
              key={step}
              className="flex items-center gap-2 font-mono text-[11px] tracking-wide uppercase text-navy/50"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-amber"
                style={{ animation: `pulse-glow 1.4s ${idx * 0.18}s ease-in-out infinite` }}
              />
              {step}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
