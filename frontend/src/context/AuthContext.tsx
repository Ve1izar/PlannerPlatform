import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { getToken, saveToken, deleteToken } from '../api/auth';
import { setGlobalLogout } from '../api/client'; // 🌟 Імпортуємо наш міст

interface AuthContextData {
    userToken: string | null;
    isLoading: boolean;
    login: (token: string) => Promise<void>;
    logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [userToken, setUserToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const logout = async () => {
        // 1. МИТТЄВО скидаємо стан. Це змусить AppNavigator 
        // одразу показати екрани Login/Register.
        setUserToken(null);

        // 2. Спокійно чистимо пам'ять у фоні, не блокуючи інтерфейс
        try {
            await deleteToken();
        } catch (e) {
            console.error("Помилка очищення пам'яті", e);
        }
    };

    // 🌟 Підключаємо функцію logout до API-клієнта при старті
    useEffect(() => {
        setGlobalLogout(logout);
    }, []);

    useEffect(() => {
        const bootstrapAsync = async () => {
            try {
                const token = await getToken();
                // Захист від текстового "null"
                if (token && token !== 'null') {
                    setUserToken(token);
                } else {
                    await deleteToken(); // Очищаємо сміття
                }
            } catch (e) {
                console.error("Помилка відновлення токена", e);
            } finally {
                setIsLoading(false);
            }
        };

        bootstrapAsync();
    }, []);

    const login = async (token: string) => {
        await saveToken(token);
        setUserToken(token);
    };

    return (
        <AuthContext.Provider value={{ userToken, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};