/**
 * Simple browser shim loader - assign the npm module to a window global automatically.
 *
 * Also exposes Fable on window so that environments without a bundler
 * (e.g., iOS WKWebView user scripts) can instantiate a Fable instance
 * for the provider without needing require().
 *
 * @license MIT
 * @author <steven@velozo.com>
 */
var libNPMModuleWrapper = require('./Meadow-Provider-Offline.js');
var libFable = require('fable');

if ((typeof(window) === 'object') && !window.hasOwnProperty('MeadowProviderOffline'))
{
	/** @type {any} */ (window).MeadowProviderOffline = libNPMModuleWrapper;
}

if ((typeof(window) === 'object') && !window.hasOwnProperty('Fable'))
{
	/** @type {any} */ (window).Fable = libFable;
}

module.exports = libNPMModuleWrapper;
