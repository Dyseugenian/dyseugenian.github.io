import { App, setPageState } from './core/App';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const context = canvas?.getContext('webgl2', {
  antialias: false,
  powerPreference: 'high-performance',
});

if (canvas && context) {
  const app = new App(canvas, context);
  app.start();
  const towerLoaded = app.loadTower();

  if (new URLSearchParams(location.search).has('debug')) {
    const { mountDebugPanel } = await import('./debug/panel');
    mountDebugPanel(app);
  }

  await app.logo.ready;
  await app.compile();
  app.setStageLive(true);
  await towerLoaded;
  app.revealTower();
} else {
  setPageState('no-webgl', true);
}
