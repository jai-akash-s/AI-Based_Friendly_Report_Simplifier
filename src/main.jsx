import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('The application could not render.', error);
  }

  render() {
    if (this.state.error) {
      return <main className="startup-error" style={{ padding: '3rem', fontFamily: 'sans-serif', color: '#18324b' }}><h1 style={{ fontSize: '2rem' }}>Unable to open this page</h1><p>{this.state.error.message || 'An unknown browser error occurred.'}</p><p>Please refresh the page. If the problem continues, restart the Flask server.</p></main>;
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
const startupMessage = document.getElementById('startup-message');

try {
  createRoot(rootElement).render(
    <StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>,
  );
  startupMessage?.remove();
} catch (error) {
  console.error('The application could not start.', error);
  startupMessage?.classList.remove('hidden');
}
