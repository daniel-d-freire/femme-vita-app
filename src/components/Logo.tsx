type Props = {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md';
};

export function Logo({ variant = 'dark', size = 'md' }: Props) {
  const isDark = variant === 'dark';
  const color = isDark ? 'text-navy' : 'text-bone';
  const dot = isDark ? 'bg-amber' : 'bg-amber';
  const ruleColor = isDark ? 'bg-navy/20' : 'bg-bone/30';
  const sizes = size === 'sm'
    ? { text: 'text-base', mark: 'text-xl', dot: 'h-1.5 w-1.5' }
    : { text: 'text-sm tracking-[0.22em]', mark: 'text-3xl', dot: 'h-2 w-2' };

  return (
    <div className={`flex items-center gap-2.5 ${color}`}>
      <div className="relative leading-none">
        <span className={`font-serif italic ${sizes.mark}`}>f</span>
        <span className={`absolute -top-0.5 -right-1.5 rounded-full ${dot} ${sizes.dot}`} />
      </div>
      <div className="flex flex-col leading-tight">
        <span className={`uppercase ${sizes.text} font-medium`}>Femme Vita</span>
        <span className={`text-[10px] tracking-[0.28em] uppercase ${isDark ? 'text-navy/50' : 'text-bone/60'}`}>Arquivo</span>
      </div>
      <span className={`ml-2 h-px w-8 ${ruleColor}`} aria-hidden />
    </div>
  );
}
