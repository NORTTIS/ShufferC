// Metro's project root is client/, but the app imports runtime code from ../shared
// (e.g. STAT_KEYS in src/lib/format.ts). watchFolders lets Metro resolve and
// watch files outside the project root.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '..', 'shared')];

module.exports = config;
