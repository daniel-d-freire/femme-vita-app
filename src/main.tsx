import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { restaurarDestino } from './lib/destino'

restaurarDestino()

// ?demo=<tela> mostra telas com dados fictícios. Só existe em `npm run dev`.
const demo = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('demo') : null
// Guardado por DEV para o Vite eliminar o import: produção não leva o chunk da vitrine.
const Demo = import.meta.env.DEV ? lazy(() => import('./dev/Demo.tsx')) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {demo !== null && Demo ? (
      <Suspense fallback={null}>
        <Demo nome={demo} />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
