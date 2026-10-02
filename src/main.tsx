import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ?demo=<tela> mostra telas com dados fictícios. Só existe em `npm run dev`.
const demo = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('demo') : null
// main.tsx é ponto de entrada (sem fast refresh): a regra não se aplica aqui.
// eslint-disable-next-line react-refresh/only-export-components
const Demo = lazy(() => import('./dev/Demo.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {demo !== null ? (
      <Suspense fallback={null}>
        <Demo nome={demo} />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
