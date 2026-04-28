import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Button,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import RecordBadge from '../components/RecordBadge';
import UserSelectionList, { SelectableUser } from '../components/UserSelectionList';
import apiClient from '../api/client';

interface Workspace {
    current_user_role: WorkspaceRole;
    description: string | null;
    id: string;
    name: string;
}

interface WorkspaceMember {
    user_id: string;
    email: string;
    name: string;
    role: WorkspaceRole;
}

type WorkspaceRole = 'admin' | 'teacher' | 'student';

const ROLE_OPTIONS: WorkspaceRole[] = ['admin', 'teacher', 'student'];
const WORKSPACES_PAGE_SIZE = 12;
const MEMBERS_PAGE_SIZE = 20;
const USERS_PAGE_SIZE = 20;

export default function WorkspacesScreen() {
    const navigation = useNavigation<any>();

    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [workspacesOffset, setWorkspacesOffset] = useState(0);
    const [hasMoreWorkspaces, setHasMoreWorkspaces] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMoreWorkspaces, setIsLoadingMoreWorkspaces] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');

    const [manageModalVisible, setManageModalVisible] = useState(false);
    const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
    const [workspaceName, setWorkspaceName] = useState('');
    const [workspaceDesc, setWorkspaceDesc] = useState('');

    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [membersOffset, setMembersOffset] = useState(0);
    const [hasMoreMembers, setHasMoreMembers] = useState(true);
    const [membersLoading, setMembersLoading] = useState(false);
    const [membersLoadingMore, setMembersLoadingMore] = useState(false);

    const [users, setUsers] = useState<SelectableUser[]>([]);
    const [usersOffset, setUsersOffset] = useState(0);
    const [hasMoreUsers, setHasMoreUsers] = useState(true);
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersLoadingMore, setUsersLoadingMore] = useState(false);
    const [userSearch, setUserSearch] = useState('');

    const [selectedCandidateEmail, setSelectedCandidateEmail] = useState<string | null>(null);
    const [memberRole, setMemberRole] = useState<WorkspaceRole>('student');
    const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
    const [isAddingMember, setIsAddingMember] = useState(false);
    const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);

    const fetchWorkspaces = useCallback(
        async (targetOffset = 0, reset = false) => {
            const response = await apiClient.get('/workspaces/', {
                params: { limit: WORKSPACES_PAGE_SIZE, offset: targetOffset },
            });

            const nextItems = response.data as Workspace[];
            setWorkspaces((prev) => (reset ? nextItems : [...prev, ...nextItems]));
            setWorkspacesOffset(targetOffset + nextItems.length);
            setHasMoreWorkspaces(nextItems.length === WORKSPACES_PAGE_SIZE);
        },
        []
    );

    const fetchMembers = useCallback(
        async (workspaceId: string, targetOffset = 0, reset = false) => {
            const response = await apiClient.get(`/workspaces/${workspaceId}/members`, {
                params: { limit: MEMBERS_PAGE_SIZE, offset: targetOffset },
            });

            const nextItems = response.data as WorkspaceMember[];
            setMembers((prev) => (reset ? nextItems : [...prev, ...nextItems]));
            setMembersOffset(targetOffset + nextItems.length);
            setHasMoreMembers(nextItems.length === MEMBERS_PAGE_SIZE);
        },
        []
    );

    const fetchUsers = useCallback(
        async (targetOffset = 0, reset = false, query = userSearch) => {
            const response = await apiClient.get('/users/', {
                params: { limit: USERS_PAGE_SIZE, offset: targetOffset, q: query.trim() || undefined },
            });

            const nextItems = response.data as SelectableUser[];
            setUsers((prev) => (reset ? nextItems : [...prev, ...nextItems]));
            setUsersOffset(targetOffset + nextItems.length);
            setHasMoreUsers(nextItems.length === USERS_PAGE_SIZE);
        },
        [userSearch]
    );

    const loadInitialWorkspaces = useCallback(async () => {
        try {
            await fetchWorkspaces(0, true);
        } catch {
            Alert.alert('Помилка', 'Не вдалося завантажити простори');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, [fetchWorkspaces]);

    useEffect(() => {
        loadInitialWorkspaces();
    }, [loadInitialWorkspaces]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadInitialWorkspaces();
    }, [loadInitialWorkspaces]);

    const loadMoreWorkspaces = async () => {
        if (isLoadingMoreWorkspaces || !hasMoreWorkspaces) {
            return;
        }

        setIsLoadingMoreWorkspaces(true);
        try {
            await fetchWorkspaces(workspacesOffset, false);
        } catch {
            Alert.alert('Помилка', 'Не вдалося дозавантажити простори');
        } finally {
            setIsLoadingMoreWorkspaces(false);
        }
    };

    useEffect(() => {
        if (!manageModalVisible) {
            return;
        }

        setUsersLoading(true);
        fetchUsers(0, true).finally(() => setUsersLoading(false));
    }, [fetchUsers, manageModalVisible, userSearch]);

    const resetCreateModal = () => {
        setCreateModalVisible(false);
        setNewName('');
        setNewDesc('');
    };

    const handleCreateWorkspace = async () => {
        if (!newName.trim()) {
            Alert.alert('Помилка', 'Введіть назву простору');
            return;
        }

        try {
            await apiClient.post('/workspaces/', {
                name: newName.trim(),
                description: newDesc.trim() || null,
            });
            resetCreateModal();
            await fetchWorkspaces(0, true);
        } catch {
            Alert.alert('Помилка', 'Не вдалося створити простір');
        }
    };

    const openManageModal = async (workspace: Workspace) => {
        setSelectedWorkspace(workspace);
        setWorkspaceName(workspace.name);
        setWorkspaceDesc(workspace.description ?? '');
        setManageModalVisible(true);
        setMembers([]);
        setMembersOffset(0);
        setHasMoreMembers(true);
        setUsers([]);
        setUsersOffset(0);
        setHasMoreUsers(true);
        setUserSearch('');
        setSelectedCandidateEmail(null);
        setMemberRole('student');
        setMembersLoading(true);

        try {
            await fetchMembers(workspace.id, 0, true);
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося завантажити дані простору');
        } finally {
            setMembersLoading(false);
        }
    };

    const canManageMembers =
        selectedWorkspace?.current_user_role === 'admin' || selectedWorkspace?.current_user_role === 'teacher';
    const canEditWorkspace = selectedWorkspace?.current_user_role === 'admin';

    const assignableRoles = useMemo(() => {
        if (selectedWorkspace?.current_user_role === 'teacher') {
            return ROLE_OPTIONS.filter((role) => role !== 'admin');
        }
        return ROLE_OPTIONS;
    }, [selectedWorkspace]);

    const availableUsers = useMemo(() => {
        const memberEmails = new Set(members.map((member) => member.email));
        return users.filter((user) => !memberEmails.has(user.email));
    }, [members, users]);

    const handleUpdateWorkspace = async () => {
        if (!selectedWorkspace) {
            return;
        }

        if (!workspaceName.trim()) {
            Alert.alert('Помилка', 'Назва простору не може бути порожньою');
            return;
        }

        setIsSavingWorkspace(true);
        try {
            await apiClient.patch(`/workspaces/${selectedWorkspace.id}`, {
                name: workspaceName.trim(),
                description: workspaceDesc.trim() || null,
            });
            await fetchWorkspaces(0, true);
            setSelectedWorkspace((prev) =>
                prev ? { ...prev, name: workspaceName.trim(), description: workspaceDesc.trim() || null } : prev
            );
            Alert.alert('Готово', 'Простір оновлено');
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося оновити простір');
        } finally {
            setIsSavingWorkspace(false);
        }
    };

    const handleDeleteWorkspace = async () => {
        if (!selectedWorkspace) {
            return;
        }

        Alert.alert(
            'Видалити простір?',
            `Простір "${selectedWorkspace.name}" буде видалено разом із просторовими задачами та звичками.`,
            [
                { text: 'Скасувати', style: 'cancel' },
                {
                    text: 'Видалити',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await apiClient.delete(`/workspaces/${selectedWorkspace.id}`);
                            setManageModalVisible(false);
                            setSelectedWorkspace(null);
                            await fetchWorkspaces(0, true);
                        } catch (error: any) {
                            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося видалити простір');
                        }
                    },
                },
            ]
        );
    };

    const handleAddMember = async () => {
        if (!selectedWorkspace || !selectedCandidateEmail) {
            Alert.alert('Помилка', 'Оберіть користувача зі списку');
            return;
        }

        setIsAddingMember(true);
        try {
            await apiClient.post(`/workspaces/${selectedWorkspace.id}/members`, {
                email: selectedCandidateEmail,
                role: memberRole,
            });

            setSelectedCandidateEmail(null);
            setMemberRole('student');
            setUserSearch('');
            await Promise.all([fetchMembers(selectedWorkspace.id, 0, true), fetchUsers(0, true, '')]);
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося додати учасника');
        } finally {
            setIsAddingMember(false);
        }
    };

    const handleUpdateMemberRole = async (member: WorkspaceMember, nextRole: WorkspaceRole) => {
        if (!selectedWorkspace || member.role === nextRole) {
            return;
        }

        setPendingMemberId(member.user_id);
        try {
            await apiClient.patch(`/workspaces/${selectedWorkspace.id}/members/${member.user_id}`, {
                role: nextRole,
            });
            await fetchMembers(selectedWorkspace.id, 0, true);
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося змінити роль учасника');
        } finally {
            setPendingMemberId(null);
        }
    };

    const handleRemoveMember = async (member: WorkspaceMember) => {
        if (!selectedWorkspace) {
            return;
        }

        Alert.alert(
            'Видалити учасника?',
            `${member.name} буде видалено з простору "${selectedWorkspace.name}".`,
            [
                { text: 'Скасувати', style: 'cancel' },
                {
                    text: 'Видалити',
                    style: 'destructive',
                    onPress: async () => {
                        setPendingMemberId(member.user_id);
                        try {
                            await apiClient.delete(`/workspaces/${selectedWorkspace.id}/members/${member.user_id}`);
                            await Promise.all([
                                fetchMembers(selectedWorkspace.id, 0, true),
                                fetchUsers(0, true, userSearch),
                            ]);
                        } catch (error: any) {
                            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося видалити учасника');
                        } finally {
                            setPendingMemberId(null);
                        }
                    },
                },
            ]
        );
    };

    const loadMoreMembers = async () => {
        if (!selectedWorkspace || membersLoadingMore || !hasMoreMembers) {
            return;
        }

        setMembersLoadingMore(true);
        try {
            await fetchMembers(selectedWorkspace.id, membersOffset, false);
        } catch {
            Alert.alert('Помилка', 'Не вдалося дозавантажити учасників');
        } finally {
            setMembersLoadingMore(false);
        }
    };

    const loadMoreUsers = async () => {
        if (usersLoadingMore || !hasMoreUsers) {
            return;
        }

        setUsersLoadingMore(true);
        try {
            await fetchUsers(usersOffset, false);
        } catch {
            Alert.alert('Помилка', 'Не вдалося дозавантажити користувачів');
        } finally {
            setUsersLoadingMore(false);
        }
    };

    const renderWorkspace = ({ item }: { item: Workspace }) => (
        <View style={styles.card}>
            <TouchableOpacity
                style={styles.workspaceMain}
                onPress={() =>
                    navigation.navigate('WorkspaceDetails', {
                        workspaceId: item.id,
                        workspaceName: item.name,
                        workspaceDescription: item.description,
                        workspaceRole: item.current_user_role,
                    })
                }
            >
                <View style={styles.iconContainer}>
                    <Ionicons name="folder-open" size={24} color="#2563eb" />
                </View>
                <View style={styles.cardContent}>
                    <View style={styles.badgeRow}>
                        <RecordBadge label="Простір" variant="blue" />
                        <RecordBadge label={item.current_user_role} variant="purple" />
                    </View>
                    <Text style={styles.title}>{item.name}</Text>
                    {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
                </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.manageButton} onPress={() => openManageModal(item)}>
                <Ionicons name="settings-outline" size={18} color="#7C3AED" />
                <Text style={styles.manageButtonText}>Керувати</Text>
            </TouchableOpacity>
        </View>
    );

    if (isLoading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={workspaces}
                keyExtractor={(item) => item.id}
                renderItem={renderWorkspace}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={<Text style={styles.emptyText}>Ви ще не є учасником жодного простору</Text>}
                ListFooterComponent={
                    isLoadingMoreWorkspaces ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null
                }
                onEndReached={loadMoreWorkspaces}
                onEndReachedThreshold={0.3}
                contentContainerStyle={{ paddingBottom: 80 }}
            />

            <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)}>
                <Ionicons name="add" size={30} color="white" />
            </TouchableOpacity>

            <Modal visible={createModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.modalTitle}>Новий простір</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Назва"
                            value={newName}
                            onChangeText={setNewName}
                        />
                        <TextInput
                            style={[styles.input, styles.largeInput]}
                            placeholder="Опис"
                            value={newDesc}
                            onChangeText={setNewDesc}
                            multiline
                        />
                        <View style={styles.modalButtons}>
                            <Button title="Скасувати" color="gray" onPress={resetCreateModal} />
                            <Button title="Створити" color="#2563eb" onPress={handleCreateWorkspace} />
                        </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal visible={manageModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.manageModalContent}>
                        <ScrollView>
                            <Text style={styles.modalTitle}>
                                {selectedWorkspace ? `Простір: ${selectedWorkspace.name}` : 'Керування простором'}
                            </Text>

                            <Text style={styles.sectionLabel}>Налаштування простору</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Назва простору"
                                value={workspaceName}
                                onChangeText={setWorkspaceName}
                                editable={canEditWorkspace}
                            />
                            <TextInput
                                style={[styles.input, styles.largeInput]}
                                placeholder="Опис простору"
                                value={workspaceDesc}
                                onChangeText={setWorkspaceDesc}
                                multiline
                                editable={canEditWorkspace}
                            />

                            {canEditWorkspace ? (
                                <View style={styles.workspaceActionsRow}>
                                    {isSavingWorkspace ? (
                                        <ActivityIndicator size="small" color="#2563eb" />
                                    ) : (
                                        <Button title="Зберегти простір" onPress={handleUpdateWorkspace} />
                                    )}
                                    <Button title="Видалити простір" color="#DC2626" onPress={handleDeleteWorkspace} />
                                </View>
                            ) : (
                                <Text style={styles.readOnlyHint}>
                                    Редагувати або видаляти простір може лише адміністратор.
                                </Text>
                            )}

                            <Text style={styles.sectionLabel}>Додати учасника</Text>
                            {usersLoading ? (
                                <ActivityIndicator size="large" color="#7C3AED" />
                            ) : (
                                <UserSelectionList
                                    label="Користувачі платформи"
                                    helperText="Оберіть користувача зі списку та призначте йому роль."
                                    searchPlaceholder="Пошук користувача"
                                    searchValue={userSearch}
                                    onSearchChange={setUserSearch}
                                    users={availableUsers}
                                    selectedEmails={selectedCandidateEmail ? [selectedCandidateEmail] : []}
                                    onToggle={(email) =>
                                        setSelectedCandidateEmail((current) => (current === email ? null : email))
                                    }
                                    emptyText="Немає доступних користувачів для додавання"
                                    hasMore={hasMoreUsers}
                                    isLoadingMore={usersLoadingMore}
                                    onLoadMore={loadMoreUsers}
                                    loadMoreText="Завантажити ще користувачів"
                                />
                            )}

                            <Text style={styles.label}>Роль нового учасника:</Text>
                            <View style={styles.roleRow}>
                                {assignableRoles.map((role) => (
                                    <TouchableOpacity
                                        key={role}
                                        style={[styles.roleOption, memberRole === role && styles.roleOptionActive]}
                                        onPress={() => setMemberRole(role)}
                                        disabled={!canManageMembers}
                                    >
                                        <Text style={memberRole === role ? styles.roleOptionTextActive : styles.roleOptionText}>
                                            {role}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {canManageMembers ? (
                                isAddingMember ? (
                                    <ActivityIndicator size="large" color="#7C3AED" style={{ marginBottom: 12 }} />
                                ) : (
                                    <Button title="Додати учасника" color="#7C3AED" onPress={handleAddMember} />
                                )
                            ) : (
                                <Text style={styles.readOnlyHint}>
                                    Додавати та редагувати учасників можуть admin або teacher.
                                </Text>
                            )}

                            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Поточні учасники</Text>
                            {membersLoading ? (
                                <ActivityIndicator size="large" color="#7C3AED" />
                            ) : members.length ? (
                                <>
                                    {members.map((member) => {
                                        const isPending = pendingMemberId === member.user_id;
                                        const roleOptionsForMember =
                                            selectedWorkspace?.current_user_role === 'teacher' && member.role === 'admin'
                                                ? (['admin'] as WorkspaceRole[])
                                                : assignableRoles;

                                        return (
                                            <View key={member.user_id} style={styles.memberCard}>
                                                <View style={styles.memberHeader}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.memberName}>{member.name}</Text>
                                                        <Text style={styles.memberEmail}>{member.email}</Text>
                                                    </View>
                                                    <RecordBadge label={member.role} variant="purple" />
                                                    {canManageMembers && !isPending ? (
                                                        <TouchableOpacity onPress={() => handleRemoveMember(member)}>
                                                            <Ionicons name="trash-outline" size={20} color="#DC2626" />
                                                        </TouchableOpacity>
                                                    ) : null}
                                                    {isPending ? (
                                                        <ActivityIndicator size="small" color="#7C3AED" />
                                                    ) : null}
                                                </View>

                                                {canManageMembers ? (
                                                    <View style={styles.memberRoleRow}>
                                                        {roleOptionsForMember.map((role) => (
                                                            <TouchableOpacity
                                                                key={role}
                                                                style={[
                                                                    styles.memberRoleOption,
                                                                    member.role === role && styles.memberRoleOptionActive,
                                                                ]}
                                                                onPress={() => handleUpdateMemberRole(member, role)}
                                                                disabled={isPending}
                                                            >
                                                                <Text
                                                                    style={
                                                                        member.role === role
                                                                            ? styles.memberRoleTextActive
                                                                            : styles.memberRoleText
                                                                    }
                                                                >
                                                                    {role}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                ) : null}
                                            </View>
                                        );
                                    })}

                                    {hasMoreMembers ? (
                                        <TouchableOpacity
                                            style={styles.loadMoreMembersButton}
                                            onPress={loadMoreMembers}
                                            disabled={membersLoadingMore}
                                        >
                                            <Text style={styles.loadMoreMembersText}>
                                                {membersLoadingMore ? 'Завантаження...' : 'Завантажити ще учасників'}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </>
                            ) : (
                                <Text style={styles.emptyTextSmall}>Немає даних про учасників</Text>
                            )}

                            <View style={[styles.modalButtons, { marginTop: 18 }]}>
                                <Button title="Закрити" color="gray" onPress={() => setManageModalVisible(false)} />
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: {
        backgroundColor: 'white',
        marginHorizontal: 15,
        marginTop: 15,
        borderRadius: 14,
        padding: 14,
        elevation: 2,
    },
    workspaceMain: { flexDirection: 'row', alignItems: 'center' },
    iconContainer: { backgroundColor: '#DBEAFE', padding: 10, borderRadius: 12, marginRight: 15 },
    cardContent: { flex: 1 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    title: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    desc: { fontSize: 14, color: '#6b7280', marginTop: 4 },
    manageButton: {
        marginTop: 12,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F3FF',
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    manageButtonText: { marginLeft: 6, color: '#7C3AED', fontWeight: '600' },
    emptyText: { textAlign: 'center', marginTop: 50, color: 'gray' },
    emptyTextSmall: { textAlign: 'center', color: '#6b7280', paddingVertical: 12 },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        backgroundColor: '#2563eb',
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
    },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
    manageModalContent: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '92%',
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#111827' },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 10,
        marginBottom: 15,
        backgroundColor: '#fff',
    },
    largeInput: { minHeight: 80, textAlignVertical: 'top' },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
    sectionLabel: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10, marginTop: 6 },
    label: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 8 },
    readOnlyHint: { fontSize: 13, color: '#6b7280', marginBottom: 14 },
    workspaceActionsRow: { gap: 10, marginBottom: 18 },
    roleRow: { flexDirection: 'row', gap: 8, marginBottom: 15 },
    roleOption: {
        flex: 1,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    roleOptionActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    roleOptionText: { color: '#374151', fontWeight: '600' },
    roleOptionTextActive: { color: 'white', fontWeight: '700' },
    memberCard: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        backgroundColor: '#fff',
    },
    memberHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    memberName: { fontSize: 15, fontWeight: '600', color: '#111827' },
    memberEmail: { fontSize: 13, color: '#6b7280', marginTop: 3 },
    memberRoleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    memberRoleOption: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    memberRoleOptionActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    memberRoleText: { color: '#374151', fontWeight: '600', fontSize: 12 },
    memberRoleTextActive: { color: 'white', fontWeight: '700', fontSize: 12 },
    loadMoreMembersButton: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    loadMoreMembersText: {
        color: '#2563eb',
        fontWeight: '600',
    },
});
