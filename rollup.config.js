import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import svelte from "rollup-plugin-svelte";
import autoPreprocess from "svelte-preprocess";
import stripCode from "rollup-plugin-strip-code";

export default {
  input: 'src/main.ts',
  output: {
    dir: '.',
    format: 'cjs',
    exports: 'default',
    sourcemap: true,
  },
  external: ['obsidian'],
  plugins: [
    // Only compile plugin sources. The shared tsconfig also includes the test
    // suites (src/**/*.test.ts, __tests__, tests/e2e) for editor/IDE
    // type-checking, but those must not be pulled into the production build.
    typescript({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/tests/**', '__tests__/**', 'tests/**'],
    }),
    nodeResolve({ browser: true, dedupe: ["svelte"] }),
    commonjs({ include: "node_modules/**" }),
    svelte({
      emitCss: false,
      preprocess: autoPreprocess(),
    }),
    process.env["BUILD"] ? stripCode({
      start_comment: 'START.DEVCMD',
      end_comment: 'END.DEVCMD'
    }) : null
  ]
};