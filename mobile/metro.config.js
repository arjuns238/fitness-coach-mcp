// Metro, the React Native bundler, extended to the server's shared types and date helpers (../src) and the web
// dashboard's formatting helpers (../web/src), so the three stay in step.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../src'), path.resolve(__dirname, '../web/src')];
// Shared files import no packages, but if one ever does, it resolves from this app's node_modules.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
