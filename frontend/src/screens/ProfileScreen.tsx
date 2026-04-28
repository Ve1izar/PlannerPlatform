import React, { useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';

import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';

interface CurrentUser {
    email: string;
    name: string;
}

export default function ProfileScreen() {
    const { logout } = useContext(AuthContext);
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [isLoadingUser, setIsLoadingUser] = useState(true);
    const [isLinking, setIsLinking] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadCurrentUser = async () => {
            try {
                const response = await apiClient.get('/users/me');
                if (isMounted) {
                    setCurrentUser(response.data);
                }
            } catch {
                if (isMounted) {
                    Alert.alert('Помилка', 'Не вдалося завантажити дані профілю');
                }
            } finally {
                if (isMounted) {
                    setIsLoadingUser(false);
                }
            }
        };

        loadCurrentUser();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleLinkGoogle = async () => {
        setIsLinking(true);
        try {
            const response = await apiClient.get('/auth/google/link');
            const authUrl = response.data.auth_url;

            if (authUrl) {
                await WebBrowser.openBrowserAsync(authUrl);
                Alert.alert(
                    'Готово',
                    "Якщо ви надали дозвіл, ваш календар тепер синхронізовано. Всі нові завдання й звички автоматично з'являтимуться там."
                );
            }
        } catch {
            Alert.alert('Помилка', "Не вдалося з'єднатися з сервером Google");
        } finally {
            setIsLinking(false);
        }
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.header}>
                <Ionicons name="person-circle" size={80} color="#2196F3" />
                <Text style={styles.title}>Мій профіль</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Акаунт</Text>

                {isLoadingUser ? (
                    <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color="#2196F3" />
                        <Text style={styles.loadingText}>Завантажуємо дані профілю...</Text>
                    </View>
                ) : currentUser ? (
                    <View style={styles.accountCard}>
                        <View style={styles.accountRow}>
                            <Ionicons name="person-outline" size={20} color="#2563eb" />
                            <View style={styles.accountTextWrap}>
                                <Text style={styles.accountLabel}>Ім’я</Text>
                                <Text style={styles.accountValue}>{currentUser.name}</Text>
                            </View>
                        </View>

                        <View style={styles.accountRow}>
                            <Ionicons name="mail-outline" size={20} color="#2563eb" />
                            <View style={styles.accountTextWrap}>
                                <Text style={styles.accountLabel}>Email</Text>
                                <Text style={styles.accountValue}>{currentUser.email}</Text>
                            </View>
                        </View>
                    </View>
                ) : (
                    <Text style={styles.hint}>Не вдалося визначити, який акаунт зараз активний.</Text>
                )}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Інтеграції</Text>
                <TouchableOpacity style={styles.googleButton} onPress={handleLinkGoogle} disabled={isLinking}>
                    <Ionicons name="logo-google" size={24} color="white" />
                    <Text style={styles.googleButtonText}>
                        {isLinking ? 'Завантаження...' : 'Підключити Google Calendar'}
                    </Text>
                </TouchableOpacity>
                <Text style={styles.hint}>
                    Підключіть календар один раз, і всі ваші завдання та звички автоматично
                    зʼявлятимуться у вашому розкладі.
                </Text>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                <Ionicons name="log-out-outline" size={24} color="red" />
                <Text style={styles.logoutText}>Вийти з акаунту</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    contentContainer: { padding: 20, paddingBottom: 32 },
    header: { alignItems: 'center', marginVertical: 30 },
    title: { fontSize: 24, fontWeight: 'bold', marginTop: 10 },
    section: { backgroundColor: 'white', padding: 20, borderRadius: 15, elevation: 2, marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
    loadingRow: { flexDirection: 'row', alignItems: 'center' },
    loadingText: { marginLeft: 10, color: '#4b5563', fontSize: 14 },
    accountCard: {
        borderWidth: 1,
        borderColor: '#dbeafe',
        backgroundColor: '#f8fbff',
        borderRadius: 12,
        padding: 14,
        gap: 14,
    },
    accountRow: { flexDirection: 'row', alignItems: 'center' },
    accountTextWrap: { marginLeft: 12, flex: 1 },
    accountLabel: { fontSize: 12, color: '#6b7280', marginBottom: 2, textTransform: 'uppercase' },
    accountValue: { fontSize: 16, fontWeight: '600', color: '#111827' },
    googleButton: {
        backgroundColor: '#4285F4',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderRadius: 10,
        justifyContent: 'center',
    },
    googleButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
    hint: { fontSize: 12, color: 'gray', marginTop: 10, textAlign: 'center', lineHeight: 18 },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 15,
        backgroundColor: '#FFEBEE',
        borderRadius: 10,
    },
    logoutText: { color: 'red', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
});
