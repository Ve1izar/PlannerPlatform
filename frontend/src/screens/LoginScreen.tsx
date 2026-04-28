import React, { useContext, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Button,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';

export default function LoginScreen({ navigation }: any) {
    const { login } = useContext(AuthContext);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Помилка', 'Будь ласка, заповніть всі поля');
            return;
        }

        setIsLoading(true);
        try {
            const response = await apiClient.post('/auth/login', {
                email: email.toLowerCase(),
                password,
                name: 'test',
            });

            const token = response.data.access_token;
            await login(token);
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || "Помилка з'єднання з сервером";
            Alert.alert('Помилка входу', errorMsg);
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
            <Text style={styles.title}>Вхід у систему</Text>

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
                <Button title="УВІЙТИ" onPress={handleLogin} />
            )}

            <View style={styles.registerContainer}>
                <Text>Немає акаунту? </Text>
                <Button title="Зареєструватися" onPress={() => navigation.navigate('Register')} />
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    contentContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 15, borderRadius: 5, backgroundColor: '#fff' },
    registerContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20, alignItems: 'center' },
});
