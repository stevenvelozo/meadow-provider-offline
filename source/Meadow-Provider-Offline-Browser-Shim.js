/**
 * Simple browser shim loader - assign the npm module to a window global automatically
 *
 * @license MIT
 * @author <steven@velozo.com>
 */
var libNPMModuleWrapper = require('./Meadow-Provider-Offline.js');

if ((typeof(window) === 'object') && !window.hasOwnProperty('MeadowProviderOffline'))
{
	/** @type {any} */ (window).MeadowProviderOffline = libNPMModuleWrapper;
}

module.exports = libNPMModuleWrapper;
