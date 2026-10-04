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
  pane
    .addBinding(settings, 'tier', { options: { low: 'low', medium: 'medium', high: 'high' } })
    .on('change', ({ value }) => app.quality.setTier(value));
  pane
    .addBinding(settings, 'stageLive', { label: 'stage live' })
    .on('change', ({ value }) => app.setStageLive(value));

  addHaloControls(pane, app.logo.halo);
  addReferenceOverlay(pane);
}

function addHaloControls(pane: Pane, halo: Halo): void {
  const { uniforms } = halo;

  const shape = pane.addFolder({ title: 'halo shape', expanded: false });
  shape.addBinding(uniforms.uDensityGain, 'value', { label: 'density', min: 0.2, max: 3 });
  shape.addBinding(uniforms.uVariation, 'value', { label: 'variation', min: 0, max: 1 });
  shape.addBinding(uniforms.uPupilFade, 'value', { label: 'pupil fade', min: 0.01, max: 0.7 });
  shape.addBinding(uniforms.uOuterFade, 'value', { label: 'outer fade', min: 0.01, max: 0.7 });
  shape.addBinding(uniforms.uOuterWobble, 'value', { label: 'outer wobble', min: 0, max: 0.5 });
  shape.addBinding(uniforms.uEdgeScatter, 'value', { label: 'edge scatter', min: 0, max: 1 });
  shape.addBinding(uniforms.uSpill, 'value', { label: 'spill', min: 0, max: 1 });
  shape.addBinding(uniforms.uSpillBelow, 'value', { label: 'spill below', min: 0, max: 1 });
  shape.addBinding(uniforms.uSpillSides, 'value', { label: 'spill sides', min: 0, max: 1 });
  shape.addBinding(uniforms.uBottomGrowth, 'value', { label: 'bottom growth', min: 0, max: 1 });
  shape.addBinding(uniforms.uSideGrowth, 'value', { label: 'side growth', min: 0, max: 0.5 });
  shape.addBinding(uniforms.uTopGrowth, 'value', { label: 'top growth', min: 0, max: 0.6 });
  shape.addBinding(uniforms.uInnerBreak, 'value', { label: 'inner break', min: 0, max: 2 });
  shape.addBinding(uniforms.uStrayReach, 'value', { label: 'stray reach', min: 0, max: 0.8 });
  shape.addBinding(uniforms.uSpillFalloff, 'value', {
    label: 'spill falloff',
    min: 0.02,
    max: 0.6,
  });
  shape.addBinding(uniforms.uScatter, 'value', { label: 'scatter', min: 0, max: 2 });
  shape.addBinding(uniforms.uPupilStretch, 'value', { label: 'pupil stretch', min: 0.6, max: 1.6 });
  shape.addBinding(uniforms.uWingLength, 'value', { label: 'wing length', min: 0, max: 1 });
  shape.addBinding(uniforms.uWingWidth, 'value', { label: 'wing width', min: 0.1, max: 1.5 });
  shape.addBinding(uniforms.uWingFlick, 'value', { label: 'wing flick', min: -1, max: 1 });
  shape.addBinding(uniforms.uWingAngle, 'value', { label: 'wing angle', min: -0.8, max: 0.8 });
  shape.addBinding(uniforms.uInnerRadius, 'value', { label: 'inner radius', min: 0.3, max: 1.2 });
  shape.addBinding(uniforms.uOuterRadius, 'value', { label: 'outer radius', min: 1.2, max: 2.5 });
  shape.addBinding(halo, 'tilt', { min: 0, max: 90 });
  shape.addBinding(halo, 'roll', { min: -30, max: 30 });

  const motion = pane.addFolder({ title: 'halo motion', expanded: false });
  motion.addBinding(uniforms.uOrbitSpeed, 'value', { label: 'orbit speed', min: 0, max: 1 });
  motion.addBinding(uniforms.uFall, 'value', { label: 'fall', min: 0, max: 0.5 });
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
