import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy'
import del from 'del'
import svench from 'svench/rollup'

const isSvench = !!process.env.SVENCH

const staticDir = 'static'
const distDir = 'dist'
const buildDir = `${distDir}/build`
const production = !process.env.ROLLUP_WATCH;
const bundling = process.env.BUNDLING || production ? 'dynamic' : 'bundle'
const shouldPrerender = (typeof process.env.PRERENDER !== 'undefined') ? process.env.PRERENDER : !!production

// use shared preprocess for svelte & svench
const preprocess = []

del.sync(distDir + '/**')

function createConfig({ output, inlineDynamicImports, plugins = [] }) {
  const transform = inlineDynamicImports ? bundledTransform : dynamicTransform

  return {
    inlineDynamicImports,
    input: `src/main.js`,
    output: {
      name: 'app',
      sourcemap: true,
      ...output
    },
    plugins: [
      svelte({
        // enable run-time checks when not in production
        dev: !production,
        hydratable: true,
        preprocess,
        // we'll extract any component CSS out into
        // a separate file — better for performance
        css: css => {
          css.write(`${buildDir}/bundle.css`);
        }
      }),

      // If you have external dependencies installed from
      // npm, you'll most likely need these plugins. In
      // some cases you'll need additional configuration —
      // consult the documentation for details:
      // https://github.com/rollup/rollup-plugin-commonjs
      resolve({
        browser: true,
        dedupe: importee => importee === 'svelte' || importee.startsWith('svelte/')
      }),

      commonjs(),

      // If we're building for production (npm run build
      // instead of npm run dev), minify
      production && terser(),

      ...plugins,
    ],
    watch: {
      clearScreen: false
    }
  }
}

const createCopyPlugin = (transform) =>
  copy({
    targets: [
      { src: staticDir + '/**/!(__index.html)', dest: distDir },
      { src: `${staticDir}/__index.html`, dest: distDir, rename: '__app.html', transform: bundledTransform },
    ], copyOnce: true
  })

const bundledConfig = {
  inlineDynamicImports: true,
  output: {
    format: 'iife',
    file: `${buildDir}/bundle.js`
  },
  plugins: [
    createCopyPlugin(bundledTransform),
    !production && serve(),
    !production && livereload(distDir)
  ]
}

const dynamicConfig = {
  inlineDynamicImports: false,
  output: {
    format: 'esm',
    dir: buildDir
  },
  plugins: [
    createCopyPlugin(dynamicTransform),
    !production && livereload(distDir),
  ]
}


let configs

if (isSvench) {
  configs = createConfig({
    plugins: [
      copy({
        targets: [
          { src: staticDir + '/**/!(__index.html)', dest: distDir },
        ],
        copyOnce: true
      }),

      svench({
        enabled: true,

        dir: './src',

        extensions: ['.svench', '.svench.svelte'],

        preprocess,

        // Example: code splitting with ES modules
        override: {
          // replace your entry with Svench's one
          input: true,
          output: {
            // change output format to ES module
            format: 'es',
            // remove the file from the original config (can't have file & dir)
            file: null,
            // and change to a dir (code splitting outputs multiple files)
            dir: 'dist/svench',
          },
        },

        index: {
          source: 'static/__index.html',
          // NOTE we need to add type="module" to use script in ES format
          replace: {
            '__SCRIPT__':
              '<script defer type="module" src="/svench/svench.js"></script>',
            'Svelte app': 'Svench app',
          },
          write: 'dist/svench.html',
        },

        serve: {
          // host: '0.0.0.0',
          port: 4242,
          public: 'dist',
        },
      }),
    ]
  })
} else {
  configs = [createConfig(bundledConfig)]
  if (bundling === 'dynamic')
    configs.push(createConfig(dynamicConfig))
  if (shouldPrerender) [...configs].pop().plugins.push(prerender())
}

export default configs


function serve() {
  let started = false;
  return {
    writeBundle() {
      if (!started) {
        started = true;
        require('child_process').spawn('npm', ['run', 'serve'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          shell: true
        });
      }
    }
  };
}

function prerender() {
  return {
    writeBundle() {
      if (shouldPrerender) {
        require('child_process').spawn('npm', ['run', 'export'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          shell: true
        });
      }
    }
  }
}

function bundledTransform(contents) {
  return contents.toString().replace('__SCRIPT__', `
		<script defer src="/build/bundle.js" ></script>
	`)
}

function dynamicTransform(contents) {
  return contents.toString().replace('__SCRIPT__', `
		<script type="module" defer src="https://unpkg.com/dimport@1.0.0/dist/index.mjs?module" data-main="/build/main.js"></script>
		<script nomodule defer src="https://unpkg.com/dimport/nomodule" data-main="/build/main.js"></script>
	`)
}
