import { Component, type ReactNode } from 'react';

export default class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="empty" role="alert">
      <h2>Não foi possível abrir o mapa</h2>
      <p>Atualize a página para carregar a versão atual. Você pode continuar explorando pela lista.</p>
      <button className="primary" onClick={() => window.location.reload()}>Atualizar página</button>
    </div>;
    return this.props.children;
  }
}
