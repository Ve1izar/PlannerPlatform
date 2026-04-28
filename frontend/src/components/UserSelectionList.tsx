import React from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SelectableUser {
    id: string;
    email: string;
    name: string;
    role?: string;
}

interface UserSelectionListProps {
    emptyText: string;
    hasMore?: boolean;
    helperText?: string;
    isLoadingMore?: boolean;
    label: string;
    loadMoreText?: string;
    onLoadMore?: () => void;
    onSearchChange: (value: string) => void;
    onToggle: (email: string) => void;
    searchPlaceholder: string;
    searchValue: string;
    selectedEmails: string[];
    users: SelectableUser[];
}

export default function UserSelectionList({
    emptyText,
    hasMore = false,
    helperText,
    isLoadingMore = false,
    label,
    loadMoreText = 'Завантажити ще',
    onLoadMore,
    onSearchChange,
    onToggle,
    searchPlaceholder,
    searchValue,
    selectedEmails,
    users,
}: UserSelectionListProps) {
    return (
        <View style={styles.container}>
            <Text style={styles.label}>{label}</Text>
            {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
            <TextInput
                style={styles.searchInput}
                placeholder={searchPlaceholder}
                value={searchValue}
                onChangeText={onSearchChange}
                autoCapitalize="none"
            />

            <ScrollView style={styles.list} nestedScrollEnabled>
                {users.length ? (
                    users.map((user) => {
                        const isSelected = selectedEmails.includes(user.email);

                        return (
                            <TouchableOpacity
                                key={user.id}
                                style={[styles.userRow, isSelected && styles.userRowSelected]}
                                onPress={() => onToggle(user.email)}
                            >
                                <View style={styles.userInfo}>
                                    <Text style={styles.userName}>{user.name}</Text>
                                    <Text style={styles.userEmail}>{user.email}</Text>
                                    {user.role ? <Text style={styles.userRole}>{user.role}</Text> : null}
                                </View>

                                <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                                    {isSelected ? <Ionicons name="checkmark" size={16} color="white" /> : null}
                                </View>
                            </TouchableOpacity>
                        );
                    })
                ) : (
                    <Text style={styles.emptyText}>{emptyText}</Text>
                )}

                {hasMore && onLoadMore ? (
                    <TouchableOpacity style={styles.loadMoreButton} onPress={onLoadMore} disabled={isLoadingMore}>
                        {isLoadingMore ? (
                            <Text style={styles.loadMoreText}>Завантаження...</Text>
                        ) : (
                            <Text style={styles.loadMoreText}>{loadMoreText}</Text>
                        )}
                    </TouchableOpacity>
                ) : null}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginBottom: 16 },
    label: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 8 },
    helperText: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
    searchInput: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 10,
        backgroundColor: '#fff',
    },
    list: {
        maxHeight: 180,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        backgroundColor: '#f9fafb',
    },
    userRow: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        flexDirection: 'row',
        alignItems: 'center',
    },
    userRowSelected: { backgroundColor: '#eff6ff' },
    userInfo: { flex: 1, paddingRight: 12 },
    userName: { fontSize: 14, fontWeight: '600', color: '#111827' },
    userEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    userRole: { fontSize: 12, color: '#7c3aed', marginTop: 3, textTransform: 'capitalize' },
    checkCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'white',
    },
    checkCircleSelected: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    emptyText: {
        textAlign: 'center',
        color: '#6b7280',
        paddingVertical: 18,
        paddingHorizontal: 12,
    },
    loadMoreButton: {
        paddingVertical: 12,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        backgroundColor: '#fff',
    },
    loadMoreText: {
        color: '#2563eb',
        fontWeight: '600',
    },
});
