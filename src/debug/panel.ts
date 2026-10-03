import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import type { FpsGraphBladeApi } from '@tweakpane/plugin-essentials';
import type { App } from '../core/App';
import type { Halo } from '../scene/Halo';

export function mountDebugPanel(app: App): void {
  const pane = new Pane({ title: 'debug' });
  pane.registerPlugin(EssentialsPlugin);

  const fpsGraph = pane.addBlade({ view: 'fpsgraph', label: 'fps', rows: 2 }) as FpsGraphBladeApi;
  measureFps(fpsGraph);

  const settings = { tier: app.quality.tier, stageLive: true };
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

  addHaloControls(pane, app.logo.halo);
  addReferenceOverlay(pane);
}

function addHaloControls(pane: Pane, halo: Halo): void {
  const { uniforms } = halo;

  const shape = pane.addFolder({ title: 'halo shape', expanded: false });
  shape.addBinding(halo, 'tilt', { min: 0, max: 90 });
  shape.addBinding(halo, 'roll', { min: -30, max: 30 });
  shape.addBinding(uniforms.uLensRadius, 'value', { label: 'lens radius', min: 0, max: 1.5 });
  shape.addBinding(uniforms.uInnerRadius, 'value', { label: 'inner radius', min: 0.05, max: 1.5 });
  shape.addBinding(uniforms.uOuterRadius, 'value', { label: 'outer radius', min: 0.2, max: 2.5 });
  shape.addBinding(uniforms.uRadialPower, 'value', { label: 'radial power', min: 0.1, max: 3 });
  shape.addBinding(uniforms.uFallRadius, 'value', { label: 'fall radius', min: 0.01, max: 0.7 });
  shape.addBinding(uniforms.uThickness, 'value', { label: 'thickness', min: 0, max: 1.5 });
  shape.addBinding(uniforms.uBeaming, 'value', { label: 'beaming', min: 0, max: 1 });
  shape.addBinding(uniforms.uBrightness, 'value', { label: 'brightness', min: 0.2, max: 3 });

  const motion = pane.addFolder({ title: 'halo motion', expanded: false });
  motion.addBinding(uniforms.uOrbitSpeed, 'value', { label: 'orbit speed', min: 0, max: 1 });
  motion.addBinding(uniforms.uDrift, 'value', { label: 'drift', min: 0.1, max: 5 });
  motion.addBinding(uniforms.uFlicker, 'value', { label: 'flicker', min: 0, max: 1 });
  motion.addBinding(uniforms.uBreath, 'value', { label: 'breath', min: 0, max: 0.5 });

  const cursor = pane.addFolder({ title: 'halo cursor', expanded: false });
  cursor.addBinding(uniforms.uPushRadius, 'value', { label: 'push radius', min: 0.05, max: 1.5 });
  cursor.addBinding(uniforms.uPushStrength, 'value', { label: 'push strength', min: 0, max: 1 });
  cursor.addBinding(halo, 'maxLean', { label: 'max lean', min: 0, max: 30 });
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
