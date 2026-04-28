import React, { useContext } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthContext } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import WorkspaceDetailScreen from '../screens/WorkspaceDetailScreen';
import WorkspaceHistoryScreen from '../screens/WorkspaceHistoryScreen';
import MainTabNavigator from './MainTabNavigator';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
    const { userToken, isLoading } = useContext(AuthContext);

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0000ff" />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator>
                {userToken == null ? (
                    <Stack.Group>
                        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Вхід' }} />
                        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Реєстрація' }} />
                    </Stack.Group>
                ) : (
                    <Stack.Group>
                        <Stack.Screen name="Main" component={MainTabNavigator} options={{ headerShown: false }} />
                        <Stack.Screen
                            name="WorkspaceDetails"
                            component={WorkspaceDetailScreen}
                            options={{ title: 'Простір' }}
                        />
                        <Stack.Screen
                            name="WorkspaceHistory"
                            component={WorkspaceHistoryScreen}
                            options={{ title: 'Історія простору' }}
                        />
                    </Stack.Group>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
