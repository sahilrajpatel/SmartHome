// metro.config.js
// -----------------------------------------------------------------------
// NOTE ON mqtt RESOLUTION:
// mqtt@5.15.2's package.json "exports" field now ships a "react-native"
// condition ("." -> "react-native": "./dist/mqtt.esm.js"), which is the
// browser-safe WebSocket build (no "net"/"tls"/"url" Node builtins).
// Expo SDK 54 enables Metro's package-exports resolution by default and
// matches that "react-native" condition automatically, so mqtt resolves
// correctly with NO override needed here.
//
// An older fix for this project disabled package-exports resolution
// (config.resolver.unstable_enablePackageExports = false) to work around
// an older mqtt version that lacked a "react-native" export condition.
// With the current mqtt version, that override instead makes Metro fall
// back to legacy resolution, which uses mqtt's "main" field
// ("./build/index.js" — the Node.js build) since mqtt's legacy "browser"
// field only remaps the "./mqtt.js" subpath, not the package root. That's
// what was causing the "attempted to import the Node standard library
// module 'url'" bundling error. Do not reintroduce that override unless
// you pin an mqtt version that has regressed to lacking the
// "react-native" export condition.
// -----------------------------------------------------------------------
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;
