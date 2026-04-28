import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Button,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
} from 'react-native';

import apiClient from '../api/client';

export default function RegisterScreen({ navigation }: any) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleRegister = async () => {
        if (!name || !email || !password) {
            Alert.alert('Помилка', 'Заповніть всі поля');
            return;
        }

        setIsLoading(true);
        try {
            await apiClient.post('/auth/register', {
                name,
                email: email.toLowerCase(),
                password,
            });

            Alert.alert('Успіх!', 'Акаунт створено. Тепер ви можете увійти.', [
                { text: 'ОК', onPress: () => navigation.goBack() },
            ]);
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || 'Помилка реєстрації';
            Alert.alert('Помилка', errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
        >
            <Text style={styles.title}>Створення акаунту</Text>

            <TextInput style={styles.input} placeholder="Ваше ім’я" value={name} onChangeText={setName} />
            <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <TextInput
                style={styles.input}
                placeholder="Пароль"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
            />

            {isLoading ? (
                <ActivityIndicator size="large" color="#0000ff" />
            ) : (
                <Button title="ЗАРЕЄСТРУВАТИСЯ" onPress={handleRegister} />
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    contentContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 15, borderRadius: 5, backgroundColor: '#fff' },
});
