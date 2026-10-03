import './ui/overlay.css';
import { App, setPageState } from './core/App';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');

if (canvas && supportsWebGL2()) {
  const app = new App(canvas);
  app.start();

  if (new URLSearchParams(location.search).has('debug')) {
    const { mountDebugPanel } = await import('./debug/panel');
    mountDebugPanel(app);
  }

  await app.logo.ready;
  app.setStageLive(true);
} else {
  setPageState('no-webgl', true);
}

function supportsWebGL2(): boolean {
  return document.createElement('canvas').getContext('webgl2') !== null;
}
