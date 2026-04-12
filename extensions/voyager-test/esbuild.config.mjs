import * as esbuild from 'esbuild'

const isWatch = process.argv.includes('--watch')

const sharedOptions = {
  bundle: true,
  minify: !isWatch,
  sourcemap: true,
  target: 'chrome120',
  logLevel: 'info',
}

const contentBuild = {
  ...sharedOptions,
  entryPoints: ['src/content/index.ts'],
  outfile: 'dist/content.js',
  format: 'iife',
}

const serviceWorkerBuild = {
  ...sharedOptions,
  entryPoints: ['src/service-worker.ts'],
  outfile: 'dist/service-worker.js',
  format: 'esm',
}

if (isWatch) {
  const ctxContent = await esbuild.context(contentBuild)
  const ctxSW = await esbuild.context(serviceWorkerBuild)
  await ctxContent.watch()
  await ctxSW.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(contentBuild)
  await esbuild.build(serviceWorkerBuild)
  console.log('Build complete.')
}
