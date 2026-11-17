import { App, setPageState } from './core/App';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const context = canvas?.getContext('webgl2', {
  antialias: false,
  powerPreference: 'high-performance',
});

const query = new URLSearchParams(location.search);
const flat = query.has('2d');

if (flat) {
  const towerSwitch = document.querySelector<HTMLAnchorElement>('.tower-switch')!;
  towerSwitch.href = location.pathname;
  towerSwitch.textContent = 'turn on 3d';
}

if (canvas && context) {
  try {
    const app = new App(canvas, context);
    const towerMade = flat ? null : app.makeTower();
    await app.start();

    if (query.has('reach')) {
      await towerMade;
      const { measureReach } = await import('./debug/reach');
      await measureReach(app);
    }

    await app.logo.ready;
    await app.compile();
    app.setStageLive(true);
    if (towerMade) {
      const tower = await towerMade;
      await app.loadTower(tower);
      app.revealTower(tower);
    }
  } catch (error) {
    setPageState('no-webgl', true);
    throw error;
  }
} else {
  setPageState('no-webgl', true);
}
