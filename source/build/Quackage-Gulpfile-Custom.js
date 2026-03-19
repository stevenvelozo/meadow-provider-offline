'use strict';

/**
 * @module Quackage-Gulpfile-Custom
 *
 * Custom gulpfile for meadow-provider-offline that extends the standard
 * Quackage gulpfile with node: protocol handling and Node-only module stubs.
 *
 * Some dependencies (find-my-way, process-warning, on-finished) use
 * Node.js built-in modules or the node: protocol prefix (e.g.
 * require('node:assert')) which browserify does not understand. This
 * gulpfile provides polyfill mappings for browser-available modules and
 * empty stubs for server-only modules.
 */

console.log(`[ Quackage-Gulpfile-Custom.js ] ---> Loading the gulp config...`);
const _CONFIG = require(`${process.cwd()}/.gulpfile-quackage-config.json`);
// Force the browser shim entry point (sets window.MeadowProviderOffline + window.Fable).
// The auto-generated config defaults to the main entry which does not set window globals.
_CONFIG.EntrypointInputSourceFile = _CONFIG.EntrypointInputSourceFile.replace(
	'Meadow-Provider-Offline.js',
	'Meadow-Provider-Offline-Browser-Shim.js'
);
console.log(`   > Building to [${_CONFIG.LibraryUniminifiedFileName}] and [${_CONFIG.LibraryMinifiedFileName}]`)

console.log(`--> Gulp is taking over!`);

const libBrowserify = require('browserify');
const libGulp = require('gulp');

const libVinylSourceStream = require('vinyl-source-stream');
const libVinylBuffer = require('vinyl-buffer');

const libSourcemaps = require('gulp-sourcemaps');
const libBabel = require('gulp-babel');
const libTerser = require('gulp-terser');

/**
 * Browserify's own builtins map — maps module names to polyfill file paths.
 * We use this to create node:-prefixed aliases that resolve to the same polyfills.
 */
const BROWSERIFY_BUILTINS = require('browserify/lib/builtins');

/** Path to browserify's empty stub module, used for Node-only APIs with no polyfill. */
const EMPTY_MODULE_PATH = require.resolve('browserify/lib/_empty.js');

/**
 * Node.js built-in modules that have no browser polyfill and should be
 * stubbed as empty modules. These are server-only APIs that some
 * dependencies reference but don't actually need in the browser.
 */
const NODE_ONLY_STUBS = [
	'async_hooks',
	'child_process',
	'cluster',
	'dgram',
	'dns',
	'fs',
	'http2',
	'inspector',
	'module',
	'net',
	'perf_hooks',
	'readline',
	'repl',
	'tls',
	'worker_threads',
	'v8',
	'trace_events',
	'diagnostics_channel',
];

/**
 * Build a builtins map that includes:
 * 1. All standard browserify polyfills
 * 2. node:-prefixed aliases for each polyfill (e.g. node:assert → assert polyfill)
 * 3. Empty stubs for Node-only modules and their node:-prefixed variants
 *
 * @returns {object} The extended builtins map
 */
function getBuiltinsWithNodeProtocol()
{
	const tmpBuiltins = Object.assign({}, BROWSERIFY_BUILTINS);

	// Add node:-prefixed aliases for existing polyfills
	for (const [ tmpName, tmpPath ] of Object.entries(BROWSERIFY_BUILTINS))
	{
		if (tmpPath && !tmpName.startsWith('_'))
		{
			tmpBuiltins[`node:${tmpName}`] = tmpPath;
		}
	}

	// Add empty stubs for Node-only modules (both bare and node:-prefixed)
	for (const tmpName of NODE_ONLY_STUBS)
	{
		if (!tmpBuiltins[tmpName])
		{
			tmpBuiltins[tmpName] = EMPTY_MODULE_PATH;
		}
		tmpBuiltins[`node:${tmpName}`] = tmpBuiltins[tmpName] || EMPTY_MODULE_PATH;
	}

	return tmpBuiltins;
}

const BUILTINS_WITH_NODE_PROTOCOL = getBuiltinsWithNodeProtocol();

// Build the module for the browser (minified)
libGulp.task('minified',
	() =>
	{
		var tmpBrowserify = libBrowserify(
		{
			entries: _CONFIG.EntrypointInputSourceFile,
			standalone: _CONFIG.LibraryObjectName,
			debug: true,
			builtins: BUILTINS_WITH_NODE_PROTOCOL
		});

		return tmpBrowserify.bundle()
			.pipe(libVinylSourceStream(_CONFIG.LibraryMinifiedFileName))
			.pipe(libVinylBuffer())
			.pipe(libSourcemaps.init({loadMaps: true}))
			.pipe(libBabel())
			.pipe(libTerser()).on('error', console.log)
			.pipe(libSourcemaps.write('./'))
			.pipe(libGulp.dest(_CONFIG.LibraryOutputFolder));
	});

// Build the module for the browser (debug)
libGulp.task('debug',
	() =>
	{
		var tmpBrowserify = libBrowserify(
		{
			entries: _CONFIG.EntrypointInputSourceFile,
			standalone: _CONFIG.LibraryObjectName,
			debug: true,
			builtins: BUILTINS_WITH_NODE_PROTOCOL
		});

		return tmpBrowserify.bundle()
			.pipe(libVinylSourceStream(_CONFIG.LibraryUniminifiedFileName))
			.pipe(libVinylBuffer())
			.pipe(libSourcemaps.init({loadMaps: true}))
			.pipe(libBabel()).on('error', console.log)
			.pipe(libSourcemaps.write('./'))
			.pipe(libGulp.dest(_CONFIG.LibraryOutputFolder));
	});

libGulp.task
(
	'build',
	libGulp.series('debug', 'minified')
);

libGulp.task
(
	'default',
	libGulp.series('debug', 'minified')
);
