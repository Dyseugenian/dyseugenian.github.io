import { App, setPageState } from './core/App';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const context = canvas?.getContext('webgl2', {
  antialias: false,
  powerPreference: 'high-performance',
});

const query = new URLSearchParams(location.search);
const onlyBuilding = query.has('building');

if (canvas && context) {
  try {
    const app = new App(canvas, context, onlyBuilding);
    const scale = Number(query.get('scale'));
    if (scale > 0) app.pinScale(scale);
    await app.start();

    if (query.has('debug')) {
      const { mountDebugPanel } = await import('./debug/panel');
      mountDebugPanel(app);
    }
    if (query.has('reach')) {
      const { measureReach } = await import('./debug/reach');
      await measureReach(app);
    }

    if (!onlyBuilding) await app.logo.ready;
    const logoCompiled = app.compile();
    const towerLoaded = app.loadTower();
    await logoCompiled;
    app.setStageLive(true);
    await towerLoaded;
    app.revealTower();
  } catch (error) {
    setPageState('no-webgl', true);
    throw error;
  }
} else {
  setPageState('no-webgl', true);
}
