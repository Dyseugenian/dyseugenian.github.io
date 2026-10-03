import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import type { FpsGraphBladeApi } from '@tweakpane/plugin-essentials';
import type { App } from '../core/App';

export function mountDebugPanel(app: App): void {
  const pane = new Pane({ title: 'debug' });
  pane.registerPlugin(EssentialsPlugin);

  const fpsGraph = pane.addBlade({ view: 'fpsgraph', label: 'fps', rows: 2 }) as FpsGraphBladeApi;
  measureFps(fpsGraph);

  const settings = { tier: app.quality.tier, stageLive: false };
  const tierBinding = pane
    .addBinding(settings, 'tier', { options: { low: 'low', medium: 'medium', high: 'high' } })
    .on('change', ({ value }) => app.quality.setTier(value));
  pane
    .addBinding(settings, 'stageLive', { label: 'stage live' })
    .on('change', ({ value }) => app.setStageLive(value));

  setInterval(() => {
    if (settings.tier === app.quality.tier) return;
    settings.tier = app.quality.tier;
    tierBinding.refresh();
  }, 500);

  addReferenceOverlay(pane);
}

function measureFps(graph: FpsGraphBladeApi): void {
  const tick = () => {
    graph.end();
    graph.begin();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function addReferenceOverlay(pane: Pane): void {
  const image = document.createElement('img');
  image.src = '/poster.webp';
  image.alt = '';
  image.style.cssText = `
    position: fixed; z-index: 10; pointer-events: none;
    left: 50%; top: var(--logo-y); width: var(--logo-size);
    transform: translate(-50%, -50%);`;
  document.body.append(image);

  const overlay = { show: false, opacity: 0.5, difference: false };
  const render = () => {
    image.hidden = !overlay.show;
    image.style.opacity = String(overlay.opacity);
    image.style.mixBlendMode = overlay.difference ? 'difference' : 'normal';
  };

  const folder = pane.addFolder({ title: 'reference overlay' });
  folder.addBinding(overlay, 'show').on('change', render);
  folder.addBinding(overlay, 'opacity', { min: 0, max: 1 }).on('change', render);
  folder.addBinding(overlay, 'difference').on('change', render);
  render();
}
