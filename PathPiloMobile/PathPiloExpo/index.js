import { registerRootComponent } from 'expo';
import { probeText } from './src/debug/textPipelineProbe';

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  // Metro / remote JS: probePathPiloText('label', someString)
  global.probePathPiloText = probeText;
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
