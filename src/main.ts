import { App, setPageState } from './core/App';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const context = canvas?.getContext('webgl2', {
  antialias: false,
  powerPreference: 'high-performance',
});

const onlyBuilding = new URLSearchParams(location.search).has('building');

if (canvas && context) {
  const app = new App(canvas, context, onlyBuilding);
  await app.start();

  if (new URLSearchParams(location.search).has('debug')) {
    const { mountDebugPanel } = await import('./debug/panel');
    mountDebugPanel(app);
  }

  if (!onlyBuilding) await app.logo.ready;
  const logoCompiled = app.compile();
  const towerLoaded = app.loadTower();
  await logoCompiled;
  app.setStageLive(true);
  await towerLoaded;
  app.revealTower();
} else {
  setPageState('no-webgl', true);
}
