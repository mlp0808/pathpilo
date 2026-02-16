const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.resolver.alias = {
  'react-native': 'react-native-web',
};

config.resolver.extraNodeModules = {
  'react-native': require.resolve('react-native-web'),
};

module.exports = config;
