const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Monorepo root (two levels up from apps/nx-wallet)
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root for packages
config.watchFolders = [monorepoRoot];

// Let Metro find packages in the monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Polyfills for React Native (Node.js modules not available)
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve("expo-crypto"),
  stream: require.resolve("readable-stream"),
  buffer: require.resolve("@craftzdog/react-native-buffer"),
  // sodium-native is a C++ addon — redirect to pure-JS implementation
  "sodium-native": require.resolve("sodium-javascript"),
};

module.exports = config;
