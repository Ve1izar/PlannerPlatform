import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import AnalyticsScreen from '../screens/AnalyticsScreen';
import DashboardScreen from '../screens/DashboardScreen';
import HabitsScreen from '../screens/HabitsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WorkspacesScreen from '../screens/WorkspacesScreen';

const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap = 'ellipse-outline';

                    if (route.name === 'Tasks') {
                        iconName = focused ? 'checkmark-circle' : 'checkmark-circle-outline';
                    } else if (route.name === 'Habits') {
                        iconName = focused ? 'sync-circle' : 'sync-circle-outline';
                    } else if (route.name === 'Analytics') {
                        iconName = focused ? 'pie-chart' : 'pie-chart-outline';
                    } else if (route.name === 'Workspaces') {
                        iconName = focused ? 'people' : 'people-outline';
                    } else if (route.name === 'Profile') {
                        iconName = focused ? 'person' : 'person-outline';
                    }

                    return <Ionicons name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: '#2196F3',
                tabBarInactiveTintColor: 'gray',
                headerShown: true,
            })}
        >
            <Tab.Screen name="Tasks" component={DashboardScreen} options={{ title: 'Завдання' }} />
            <Tab.Screen name="Habits" component={HabitsScreen} options={{ title: 'Звички' }} />
            <Tab.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Аналітика' }} />
            <Tab.Screen name="Workspaces" component={WorkspacesScreen} options={{ title: 'Простори' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Профіль' }} />
        </Tab.Navigator>
    );
}
