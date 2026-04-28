import React from 'react';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
    return (
        // AuthProvider обгортає всю навігацію, тому дані про користувача доступні скрізь
        <AuthProvider>
            <AppNavigator />
        </AuthProvider>
    );
}