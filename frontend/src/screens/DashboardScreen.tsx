import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Button,
    Modal,
    RefreshControl,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import RecordBadge from '../components/RecordBadge';
import TaskSchedulePicker from '../components/TaskSchedulePicker';
import UserSelectionList, { SelectableUser } from '../components/UserSelectionList';
import apiClient from '../api/client';

interface Task {
    id: string;
    title: string;
    description: string | null;
    status: string;
    due_date: string | null;
    workspace_id: string | null;
    participant_emails?: string[] | null;
}

type TaskModalMode = 'create' | 'edit';

function splitDueDate(dueDate: string | null | undefined) {
    if (!dueDate) {
        return { date: '', time: '' };
    }

    const normalized = dueDate.replace(' ', 'T');
    const [datePart, timePart = ''] = normalized.split('T');
    return {
        date: datePart?.slice(0, 10) ?? '',
        time: timePart.slice(0, 5),
    };
}

function formatDueDate(dueDate: string | null) {
    if (!dueDate) {
        return null;
    }

    const { date, time } = splitDueDate(dueDate);
    return date ? (time ? `${date} ${time}` : date) : null;
}

function buildDueDatePayload(date: string, time: string) {
    if (!date.trim()) {
        return null;
    }

    const normalizedTime = time.trim() || '23:59';
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timePattern.test(normalizedTime)) {
        return { error: 'Введіть час у форматі HH:MM' };
    }

    return { value: `${date.trim()}T${normalizedTime}:00` };
}

function toggleEmailSelection(selectedEmails: string[], email: string) {
    return selectedEmails.includes(email)
        ? selectedEmails.filter((item) => item !== email)
        : [...selectedEmails, email];
}

export default function DashboardScreen() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [shareUsers, setShareUsers] = useState<SelectableUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState<TaskModalMode>('create');
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDesc, setTaskDesc] = useState('');
    const [taskDate, setTaskDate] = useState('');
    const [taskTime, setTaskTime] = useState('');
    const [selectedParticipantEmails, setSelectedParticipantEmails] = useState<string[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

    const fetchTasks = async () => {
        const response = await apiClient.get('/tasks/?status_filter=active');
        setTasks(response.data.filter((task: Task) => !task.workspace_id));
    };

    const fetchShareUsers = async () => {
        const response = await apiClient.get('/users/');
        setShareUsers(response.data);
    };

    const loadScreenData = useCallback(async () => {
        try {
            await Promise.all([fetchTasks(), fetchShareUsers()]);
        } catch {
            Alert.alert('Помилка', 'Не вдалося завантажити дані задач');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadScreenData();
    }, [loadScreenData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadScreenData();
    }, [loadScreenData]);

    const resetModalState = () => {
        setModalVisible(false);
        setModalMode('create');
        setEditingTaskId(null);
        setTaskTitle('');
        setTaskDesc('');
        setTaskDate('');
        setTaskTime('');
        setSelectedParticipantEmails([]);
        setUserSearch('');
        setIsSubmitting(false);
    };

    const openCreateModal = () => {
        resetModalState();
        setModalVisible(true);
    };

    const openEditModal = (task: Task) => {
        const dueDateParts = splitDueDate(task.due_date);

        setModalMode('edit');
        setEditingTaskId(task.id);
        setTaskTitle(task.title);
        setTaskDesc(task.description ?? '');
        setTaskDate(dueDateParts.date);
        setTaskTime(dueDateParts.time);
        setSelectedParticipantEmails(task.participant_emails ?? []);
        setUserSearch('');
        setModalVisible(true);
    };

    const completeTask = async (taskId: string) => {
        setPendingTaskId(taskId);
        try {
            await apiClient.patch(`/tasks/${taskId}/status`, { status: 'completed' });
            setTasks((prev) => prev.filter((task) => task.id !== taskId));
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося оновити статус');
        } finally {
            setPendingTaskId((current) => (current === taskId ? null : current));
        }
    };

    const handleSubmitTask = async () => {
        if (!taskTitle.trim()) {
            Alert.alert('Помилка', "Назва завдання є обов'язковою");
            return;
        }

        if (taskDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(taskDate.trim())) {
            Alert.alert('Помилка', 'Введіть дату у форматі YYYY-MM-DD');
            return;
        }

        const dueDateResult = buildDueDatePayload(taskDate, taskTime);
        if (dueDateResult && 'error' in dueDateResult) {
            Alert.alert('Помилка', dueDateResult.error);
            return;
        }

        setIsSubmitting(true);

        const payload = {
            title: taskTitle.trim(),
            description: taskDesc.trim() || null,
            due_date: dueDateResult?.value ?? null,
            workspace_id: null,
            participant_emails: selectedParticipantEmails,
        };

        try {
            if (modalMode === 'edit' && editingTaskId) {
                await apiClient.patch(`/tasks/${editingTaskId}`, payload);
            } else {
                await apiClient.post('/tasks/', payload);
            }

            resetModalState();
            await fetchTasks();
        } catch (error: any) {
            Alert.alert(
                'Помилка',
                error.response?.data?.detail ||
                    (modalMode === 'edit' ? 'Не вдалося зберегти зміни' : 'Не вдалося створити завдання')
            );
            setIsSubmitting(false);
        }
    };

    const deleteTask = async (taskId: string) => {
        setPendingTaskId(taskId);
        try {
            await apiClient.delete(`/tasks/${taskId}`);
            setTasks((prev) => prev.filter((task) => task.id !== taskId));
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося видалити завдання');
        } finally {
            setPendingTaskId((current) => (current === taskId ? null : current));
        }
    };

    const confirmDeleteTask = (task: Task) => {
        Alert.alert(
            'Видалити завдання?',
            `Завдання "${task.title}" буде видалено безповоротно.`,
            [
                { text: 'Скасувати', style: 'cancel' },
                {
                    text: 'Видалити',
                    style: 'destructive',
                    onPress: () => deleteTask(task.id),
                },
            ]
        );
    };

    const filteredShareUsers = useMemo(() => {
        const normalizedQuery = userSearch.trim().toLowerCase();
        if (!normalizedQuery) {
            return shareUsers;
        }

        return shareUsers.filter(
            (user) =>
                user.name.toLowerCase().includes(normalizedQuery) ||
                user.email.toLowerCase().includes(normalizedQuery)
        );
    }, [shareUsers, userSearch]);

    const sections = useMemo(() => {
        const personalTasks = tasks.filter((task) => !(task.participant_emails ?? []).length);
        const sharedTasks = tasks.filter((task) => (task.participant_emails ?? []).length > 0);

        return [
            { title: 'Мої задачі', data: personalTasks },
            { title: 'Спільні задачі', data: sharedTasks },
        ];
    }, [tasks]);

    const renderTask = ({ item }: { item: Task }) => {
        const isPending = pendingTaskId === item.id;
        const dueDateText = formatDueDate(item.due_date);
        const participantEmails = item.participant_emails ?? [];

        return (
            <View style={styles.card}>
                <View style={styles.cardContent}>
                    <View style={styles.badgeRow}>
                        <RecordBadge
                            label={participantEmails.length ? 'Спільне' : 'Особисте'}
                            variant={participantEmails.length ? 'purple' : 'blue'}
                        />
                    </View>
                    <Text style={styles.taskTitle}>{item.title}</Text>
                    {item.description ? <Text style={styles.taskDesc}>{item.description}</Text> : null}
                    {dueDateText ? <Text style={styles.taskMeta}>Дедлайн: {dueDateText}</Text> : null}
                    {participantEmails.length ? (
                        <Text style={styles.taskScope}>Разом з: {participantEmails.join(', ')}</Text>
                    ) : null}
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity
                        onPress={() => openEditModal(item)}
                        style={[styles.iconButton, styles.editButton]}
                        disabled={isPending}
                    >
                        <Ionicons name="create-outline" size={20} color="#1E88E5" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => confirmDeleteTask(item)}
                        style={[styles.iconButton, styles.deleteButton]}
                        disabled={isPending}
                    >
                        <Ionicons name="trash-outline" size={20} color="#E53935" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => completeTask(item.id)}
                        style={[styles.iconButton, styles.completeButton]}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <ActivityIndicator size="small" color="#4CAF50" />
                        ) : (
                            <Ionicons name="checkmark-circle-outline" size={28} color="#4CAF50" />
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    if (isLoading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderItem={renderTask}
                renderSectionHeader={({ section }) => (
                    <Text style={styles.sectionTitle}>
                        {section.title} ({section.data.length})
                    </Text>
                )}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={<Text style={styles.emptyText}>У вас немає активних задач.</Text>}
                contentContainerStyle={{ paddingBottom: 90 }}
                stickySectionHeadersEnabled={false}
            />

            <TouchableOpacity style={styles.fab} onPress={openCreateModal}>
                <Ionicons name="add" size={30} color="white" />
            </TouchableOpacity>

            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.modalTitle}>
                            {modalMode === 'edit' ? 'Редагувати завдання' : 'Нове завдання'}
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Назва завдання"
                            value={taskTitle}
                            onChangeText={setTaskTitle}
                        />
                        <TextInput
                            style={[styles.input, styles.multilineInput]}
                            placeholder="Опис (необов'язково)"
                            value={taskDesc}
                            onChangeText={setTaskDesc}
                            multiline
                        />

                        <TaskSchedulePicker
                            dateValue={taskDate}
                            timeValue={taskTime}
                            onDateChange={setTaskDate}
                            onTimeChange={setTaskTime}
                        />

                        <UserSelectionList
                            label="Спільний доступ"
                            helperText="Оберіть користувачів, якщо задача має бути спільною. Без вибору вона залишиться особистою."
                            searchPlaceholder="Пошук користувача"
                            searchValue={userSearch}
                            onSearchChange={setUserSearch}
                            users={filteredShareUsers}
                            selectedEmails={selectedParticipantEmails}
                            onToggle={(email) =>
                                setSelectedParticipantEmails((prev) => toggleEmailSelection(prev, email))
                            }
                            emptyText="Немає користувачів для вибору"
                        />

                        {isSubmitting ? (
                            <ActivityIndicator size="large" color="#2196F3" />
                        ) : (
                            <View style={styles.modalButtons}>
                                <Button title="Скасувати" color="gray" onPress={resetModalState} />
                                <Button
                                    title={modalMode === 'edit' ? 'Зберегти' : 'Створити'}
                                    onPress={handleSubmitTask}
                                />
                            </View>
                        )}
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
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1f2937',
        marginTop: 18,
        marginBottom: 4,
        marginHorizontal: 15,
    },
    card: {
        backgroundColor: 'white',
        padding: 15,
        marginHorizontal: 15,
        marginTop: 10,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 2,
    },
    cardContent: { flex: 1, paddingRight: 12 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    taskTitle: { fontSize: 18, fontWeight: '600' },
    taskDesc: { fontSize: 14, color: '#666', marginTop: 4 },
    taskMeta: { fontSize: 13, color: '#1E88E5', marginTop: 6 },
    taskScope: { fontSize: 13, color: '#6b7280', marginTop: 4 },
    actions: { flexDirection: 'row', alignItems: 'center' },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    editButton: { backgroundColor: '#E3F2FD' },
    deleteButton: { backgroundColor: '#FFEBEE' },
    completeButton: { backgroundColor: '#E8F5E9' },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: 'gray' },
    fab: {
        position: 'absolute',
        width: 60,
        height: 60,
        alignItems: 'center',
        justifyContent: 'center',
        right: 20,
        bottom: 20,
        backgroundColor: '#2196F3',
        borderRadius: 30,
        elevation: 8,
    },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        elevation: 5,
        maxHeight: '92%',
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 10,
        marginBottom: 15,
        fontSize: 16,
        backgroundColor: '#fff',
    },
    multilineInput: { minHeight: 80, textAlignVertical: 'top' },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
});
