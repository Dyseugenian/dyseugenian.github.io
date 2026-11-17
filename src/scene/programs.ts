import type { Material, WebGLRenderer } from 'three';

export function resolveUniforms(renderer: WebGLRenderer, material: Material): void {
  const { currentProgram } = renderer.properties.get(material) as {
    currentProgram: { getUniforms: () => void };
  };
  currentProgram.getUniforms();
}
