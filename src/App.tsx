import { HashRouter, Route, A, useLocation, type RouteSectionProps } from '@solidjs/router'
import { Show } from 'solid-js'
import { ArrowLeft } from 'lucide-solid'
import { wsConnected, wsMidiPort } from './ws'
import { pageTitle } from './state'
import Overview from './pages/Overview'
import Surface from './pages/Surface'

function Root(props: RouteSectionProps) {
  const location = useLocation()
  const onSurface = () => location.pathname.startsWith('/surface/')

  return (
    <div id="app-shell">
      <header id="header">
        <div id="header-left">
          <Show when={onSurface()}>
            <A href="/" class="back-btn" aria-label="Back to surfaces">
              <ArrowLeft size={18} />
            </A>
          </Show>
          <span class="logo">▶</span>
          <span class="page-title">{pageTitle()}</span>
        </div>
        <div id="status">
          <span class={`status-dot ${wsConnected() ? 'connected' : 'disconnected'}`} />
          <span class="status-text">
            {wsConnected() ? (wsMidiPort() ?? 'connected') : 'offline'}
          </span>
        </div>
      </header>
      <main id="content">{props.children}</main>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter root={Root}>
      <Route path="/" component={Overview} />
      <Route path="/surface/:id" component={Surface} />
    </HashRouter>
  )
}
