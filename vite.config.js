import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function copyGameModels() {
  return {
    name: 'copy-game-models',
    closeBundle() {
      const src = resolve('assets/models');
      const dest = resolve('dist/assets/models');
      if (!existsSync(src)) return;
      mkdirSync(resolve('dist/assets'), { recursive: true });
      cpSync(src, dest, { recursive: true });
    }
  };
}

// Orion-07: servidor de desarrollo y build estático. vite-plugin-glsl permite
// importar archivos .glsl (js/shaders/) como strings, con soporte de
// `#include ruta.glsl;` para compartir chunks (p. ej. el ruido del terreno,
// que DEBE ser idéntico entre shaders para la paridad CPU/GPU).
export default defineConfig({
  base: './',
  plugins: [glsl(), copyGameModels()],
  server: {
    port: 5173,
    strictPort: true
  }
});
