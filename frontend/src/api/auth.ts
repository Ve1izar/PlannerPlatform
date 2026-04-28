import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'userToken';

export const saveToken = async (token: string) => {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.localStorage.setItem(TOKEN_KEY, token);
        } else {
            await SecureStore.setItemAsync(TOKEN_KEY, token);
        }
    } catch (error) {
        console.error('Помилка збереження токена:', error);
    }
};

export const getToken = async () => {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            return window.localStorage.getItem(TOKEN_KEY);
        } else {
            return await SecureStore.getItemAsync(TOKEN_KEY);
        }
    } catch (error) {
        console.error('Помилка отримання токена:', error);
        return null;
    }
};

export const deleteToken = async () => {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.localStorage.removeItem(TOKEN_KEY);
        } else {
            await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
    } catch (error) {
        console.error('Помилка видалення токена:', error);
    }
};