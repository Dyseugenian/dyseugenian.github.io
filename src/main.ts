import { App, setPageState } from './core/App';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const context = canvas?.getContext('webgl2', {
  antialias: false,
  powerPreference: 'high-performance',
});

const query = new URLSearchParams(location.search);
const onlyBuilding = query.has('building');
const flat = query.has('2d');

if (flat) {
  const towerSwitch = document.querySelector<HTMLAnchorElement>('.tower-switch')!;
  towerSwitch.href = location.pathname;
  towerSwitch.textContent = 'turn on 3d';
}

if (canvas && context) {
  try {
    const app = new App(canvas, context, onlyBuilding);
    const towerMade = flat ? null : app.makeTower();
    const scale = Number(query.get('scale'));
    if (scale > 0) app.pinScale(scale);
    await app.start();

    if (query.has('debug')) {
      const { mountDebugPanel } = await import('./debug/panel');
      mountDebugPanel(app);
    }
    if (query.has('reach')) {
      await towerMade;
      const { measureReach } = await import('./debug/reach');
      await measureReach(app);
    }

    if (!onlyBuilding) await app.logo.ready;
    const logoCompiled = app.compile();
    const towerLoaded = towerMade?.then(async (tower) => {
      await app.loadTower(tower);
      return tower;
    });
    await logoCompiled;
    app.setStageLive(true);
    if (towerLoaded) app.revealTower(await towerLoaded);
  } catch (error) {
    setPageState('no-webgl', true);
    throw error;
  }
} else {
  setPageState('no-webgl', true);
}
