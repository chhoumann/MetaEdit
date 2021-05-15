import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import svelte from "rollup-plugin-svelte";
import autoPreprocess from "svelte-preprocess";
export default {
  input: 'src/main.ts',
  output: {
    dir: '.',
    format: 'cjs',
    exports: 'default',
  },
  external: ['obsidian'],
  plugins: [
    typescript(),
    nodeResolve({ browser: true, dedupe: ["svelte"] }),
    commonjs({ include: "node_modules/**" }),
    svelte({
      emitCss: false,
      preprocess: autoPreprocess(),
    }),
  ]
};