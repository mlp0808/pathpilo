import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Placeholder screen - will be replaced with actual screens
import PlaceholderScreen from '../screens/PlaceholderScreen';

export type RootStackParamList = {
  Placeholder: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Placeholder"
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="Placeholder" component={PlaceholderScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
