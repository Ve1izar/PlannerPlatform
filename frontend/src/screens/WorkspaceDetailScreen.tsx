import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Button,
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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';

import RecordBadge from '../components/RecordBadge';
import TaskSchedulePicker from '../components/TaskSchedulePicker';
import UserSelectionList, { SelectableUser } from '../components/UserSelectionList';
import apiClient from '../api/client';

type WorkspaceDetailRoute = RouteProp<
    {
        WorkspaceDetails: {
            workspaceDescription?: string | null;
            workspaceId: string;
            workspaceName: string;
            workspaceRole: 'admin' | 'teacher' | 'student';
        };
    },
    'WorkspaceDetails'
>;

type TaskModalMode = 'create' | 'edit';
type HabitModalMode = 'create' | 'edit';
type MonthlyPosition = 'first' | 'second' | 'third' | 'fourth' | 'last';
type TaskStatusFilter = 'active' | 'completed';
type TaskAssignmentFilter = 'all' | 'assigned_to_me' | 'spacewide';
type HabitAssignmentFilter = 'all' | 'mine' | 'spacewide';

interface CurrentUser {
    email: string;
    id: string;
}

interface WorkspaceTask {
    id: string;
    title: string;
    description: string | null;
    status: string;
    due_date: string | null;
    created_by: string;
    completed_at?: string | null;
    participant_emails?: string[] | null;
}

interface MonthlyPattern {
    week_of_month: MonthlyPosition;
    weekday: number;
}

type HabitTargetDays = number[] | MonthlyPattern | null;

interface WorkspaceHabit {
    created_by: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    id: string;
    participant_emails?: string[] | null;
    target_days: HabitTargetDays;
    title: string;
}

const DAYS_OF_WEEK = [
    { id: 0, label: 'Пн' },
    { id: 1, label: 'Вт' },
    { id: 2, label: 'Ср' },
    { id: 3, label: 'Чт' },
    { id: 4, label: 'Пт' },
    { id: 5, label: 'Сб' },
    { id: 6, label: 'Нд' },
];

const MONTHLY_POSITIONS: { value: MonthlyPosition; label: string }[] = [
    { value: 'first', label: 'Перша' },
    { value: 'second', label: 'Друга' },
    { value: 'third', label: 'Третя' },
    { value: 'fourth', label: 'Четверта' },
    { value: 'last', label: 'Остання' },
];

const TASKS_PAGE_SIZE = 12;
const HABITS_PAGE_SIZE = 12;
const MEMBERS_PAGE_SIZE = 30;

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

function isMonthlyPattern(value: HabitTargetDays): value is MonthlyPattern {
    return !!value && !Array.isArray(value) && typeof value === 'object';
}

function toggleEmailSelection(selectedEmails: string[], email: string) {
    return selectedEmails.includes(email)
        ? selectedEmails.filter((item) => item !== email)
        : [...selectedEmails, email];
}

function formatHabitFrequency(habit: WorkspaceHabit) {
    const targetDays = habit.target_days;

    if (habit.frequency === 'daily') {
        return 'Щодня';
    }

    if (habit.frequency === 'weekly' && Array.isArray(targetDays) && targetDays.length) {
        const labels = DAYS_OF_WEEK
            .filter((day) => targetDays.includes(day.id))
            .map((day) => day.label)
            .join(', ');
        return `Щотижня: ${labels}`;
    }

    if (habit.frequency === 'monthly' && isMonthlyPattern(targetDays)) {
        const positionLabel = MONTHLY_POSITIONS.find(
            (position) => position.value === targetDays.week_of_month
        )?.label;
        const weekdayLabel = DAYS_OF_WEEK.find((day) => day.id === targetDays.weekday)?.label;

        if (positionLabel && weekdayLabel) {
            return `Щомісяця: ${positionLabel.toLowerCase()} ${weekdayLabel.toLowerCase()}`;
        }
    }

    return 'Налаштований розклад';
}

function formatCompletedAt(value: string | null | undefined) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
    ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function WorkspaceDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<WorkspaceDetailRoute>();
    const { workspaceDescription, workspaceId, workspaceName, workspaceRole } = route.params;

    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

    const [members, setMembers] = useState<SelectableUser[]>([]);
    const [membersOffset, setMembersOffset] = useState(0);
    const [hasMoreMembers, setHasMoreMembers] = useState(true);
    const [membersLoading, setMembersLoading] = useState(true);
    const [membersLoadingMore, setMembersLoadingMore] = useState(false);

    const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
    const [tasksOffset, setTasksOffset] = useState(0);
    const [hasMoreTasks, setHasMoreTasks] = useState(true);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [tasksLoadingMore, setTasksLoadingMore] = useState(false);
    const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>('active');
    const [taskAssignmentFilter, setTaskAssignmentFilter] = useState<TaskAssignmentFilter>('all');

    const [habits, setHabits] = useState<WorkspaceHabit[]>([]);
    const [habitsOffset, setHabitsOffset] = useState(0);
    const [hasMoreHabits, setHasMoreHabits] = useState(true);
    const [habitsLoading, setHabitsLoading] = useState(true);
    const [habitsLoadingMore, setHabitsLoadingMore] = useState(false);
    const [habitAssignmentFilter, setHabitAssignmentFilter] = useState<HabitAssignmentFilter>('all');

    const [refreshing, setRefreshing] = useState(false);

    const [taskModalVisible, setTaskModalVisible] = useState(false);
    const [taskModalMode, setTaskModalMode] = useState<TaskModalMode>('create');
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDesc, setTaskDesc] = useState('');
    const [taskDate, setTaskDate] = useState('');
    const [taskTime, setTaskTime] = useState('');
    const [selectedTaskParticipantEmails, setSelectedTaskParticipantEmails] = useState<string[]>([]);
    const [taskSearch, setTaskSearch] = useState('');
    const [isTaskSubmitting, setIsTaskSubmitting] = useState(false);
    const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

    const [habitModalVisible, setHabitModalVisible] = useState(false);
    const [habitModalMode, setHabitModalMode] = useState<HabitModalMode>('create');
    const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
    const [habitTitle, setHabitTitle] = useState('');
    const [frequency, setFrequency] = useState<WorkspaceHabit['frequency']>('daily');
    const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
    const [monthlyPosition, setMonthlyPosition] = useState<MonthlyPosition>('first');
    const [monthlyWeekday, setMonthlyWeekday] = useState<number>(0);
    const [selectedHabitParticipantEmails, setSelectedHabitParticipantEmails] = useState<string[]>([]);
    const [habitSearch, setHabitSearch] = useState('');
    const [isHabitSubmitting, setIsHabitSubmitting] = useState(false);
    const [pendingHabitId, setPendingHabitId] = useState<string | null>(null);

    const canManageWorkspaceContent = workspaceRole === 'admin' || workspaceRole === 'teacher';

    const fetchCurrentUser = useCallback(async () => {
        const response = await apiClient.get('/users/me');
        setCurrentUser(response.data);
    }, []);

    const fetchMembers = useCallback(
        async (targetOffset = 0, reset = false) => {
            const response = await apiClient.get(`/workspaces/${workspaceId}/members`, {
                params: { limit: MEMBERS_PAGE_SIZE, offset: targetOffset },
            });
            const nextItems = response.data as SelectableUser[];
            setMembers((prev) => (reset ? nextItems : [...prev, ...nextItems]));
            setMembersOffset(targetOffset + nextItems.length);
            setHasMoreMembers(nextItems.length === MEMBERS_PAGE_SIZE);
        },
        [workspaceId]
    );

    const fetchTasks = useCallback(
        async (targetOffset = 0, reset = false) => {
            const response = await apiClient.get(`/workspaces/${workspaceId}/tasks`, {
                params: {
                    limit: TASKS_PAGE_SIZE,
                    offset: targetOffset,
                    status_filter: taskStatusFilter,
                    assignment_filter: taskAssignmentFilter,
                },
            });
            const nextItems = response.data as WorkspaceTask[];
            setTasks((prev) => (reset ? nextItems : [...prev, ...nextItems]));
            setTasksOffset(targetOffset + nextItems.length);
            setHasMoreTasks(nextItems.length === TASKS_PAGE_SIZE);
        },
        [taskAssignmentFilter, taskStatusFilter, workspaceId]
    );

    const fetchHabits = useCallback(
        async (targetOffset = 0, reset = false) => {
            const response = await apiClient.get(`/workspaces/${workspaceId}/habits`, {
                params: {
                    limit: HABITS_PAGE_SIZE,
                    offset: targetOffset,
                    assignment_filter: habitAssignmentFilter,
                },
            });
            const nextItems = response.data as WorkspaceHabit[];
            setHabits((prev) => (reset ? nextItems : [...prev, ...nextItems]));
            setHabitsOffset(targetOffset + nextItems.length);
            setHasMoreHabits(nextItems.length === HABITS_PAGE_SIZE);
        },
        [habitAssignmentFilter, workspaceId]
    );

    useEffect(() => {
        Promise.all([fetchCurrentUser(), fetchMembers(0, true)])
            .catch(() => Alert.alert('Помилка', 'Не вдалося завантажити дані простору'))
            .finally(() => setMembersLoading(false));
    }, [fetchCurrentUser, fetchMembers]);

    useEffect(() => {
        setTasksLoading(true);
        fetchTasks(0, true)
            .catch(() => Alert.alert('Помилка', 'Не вдалося завантажити задачі простору'))
            .finally(() => setTasksLoading(false));
    }, [fetchTasks]);

    useEffect(() => {
        setHabitsLoading(true);
        fetchHabits(0, true)
            .catch(() => Alert.alert('Помилка', 'Не вдалося завантажити звички простору'))
            .finally(() => setHabitsLoading(false));
    }, [fetchHabits]);

    const isLoading = !currentUser || membersLoading || tasksLoading || habitsLoading;

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                fetchCurrentUser(),
                fetchMembers(0, true),
                fetchTasks(0, true),
                fetchHabits(0, true),
            ]);
        } catch {
            Alert.alert('Помилка', 'Не вдалося оновити простір');
        } finally {
            setRefreshing(false);
        }
    }, [fetchCurrentUser, fetchHabits, fetchMembers, fetchTasks]);

    const resetTaskModal = () => {
        setTaskModalVisible(false);
        setTaskModalMode('create');
        setEditingTaskId(null);
        setTaskTitle('');
        setTaskDesc('');
        setTaskDate('');
        setTaskTime('');
        setSelectedTaskParticipantEmails([]);
        setTaskSearch('');
        setIsTaskSubmitting(false);
    };

    const resetHabitModal = () => {
        setHabitModalVisible(false);
        setHabitModalMode('create');
        setEditingHabitId(null);
        setHabitTitle('');
        setFrequency('daily');
        setWeeklyDays([]);
        setMonthlyPosition('first');
        setMonthlyWeekday(0);
        setSelectedHabitParticipantEmails([]);
        setHabitSearch('');
        setIsHabitSubmitting(false);
    };

    const openCreateTaskModal = () => {
        resetTaskModal();
        setTaskModalVisible(true);
    };

    const openEditTaskModal = (task: WorkspaceTask) => {
        const dueDateParts = splitDueDate(task.due_date);

        setTaskModalMode('edit');
        setEditingTaskId(task.id);
        setTaskTitle(task.title);
        setTaskDesc(task.description ?? '');
        setTaskDate(dueDateParts.date);
        setTaskTime(dueDateParts.time);
        setSelectedTaskParticipantEmails(task.participant_emails ?? []);
        setTaskSearch('');
        setTaskModalVisible(true);
    };

    const openCreateHabitModal = () => {
        resetHabitModal();
        setHabitModalVisible(true);
    };

    const openEditHabitModal = (habit: WorkspaceHabit) => {
        setHabitModalMode('edit');
        setEditingHabitId(habit.id);
        setHabitTitle(habit.title);
        setFrequency(habit.frequency);
        setSelectedHabitParticipantEmails(habit.participant_emails ?? []);
        setHabitSearch('');

        if (habit.frequency === 'weekly' && Array.isArray(habit.target_days)) {
            setWeeklyDays(habit.target_days);
        } else {
            setWeeklyDays([]);
        }

        if (habit.frequency === 'monthly' && isMonthlyPattern(habit.target_days)) {
            setMonthlyPosition(habit.target_days.week_of_month);
            setMonthlyWeekday(habit.target_days.weekday);
        } else {
            setMonthlyPosition('first');
            setMonthlyWeekday(0);
        }

        setHabitModalVisible(true);
    };

    const toggleDay = (dayId: number) => {
        setWeeklyDays((prev) =>
            prev.includes(dayId) ? prev.filter((day) => day !== dayId) : [...prev, dayId].sort()
        );
    };

    const buildTargetDays = (): HabitTargetDays => {
        if (frequency === 'weekly') {
            return weeklyDays;
        }

        if (frequency === 'monthly') {
            return {
                week_of_month: monthlyPosition,
                weekday: monthlyWeekday,
            };
        }

        return null;
    };

    const filteredTaskMembers = useMemo(() => {
        const normalizedQuery = taskSearch.trim().toLowerCase();
        if (!normalizedQuery) {
            return members;
        }

        return members.filter(
            (member) =>
                member.name.toLowerCase().includes(normalizedQuery) ||
                member.email.toLowerCase().includes(normalizedQuery)
        );
    }, [members, taskSearch]);

    const filteredHabitMembers = useMemo(() => {
        const normalizedQuery = habitSearch.trim().toLowerCase();
        if (!normalizedQuery) {
            return members;
        }

        return members.filter(
            (member) =>
                member.name.toLowerCase().includes(normalizedQuery) ||
                member.email.toLowerCase().includes(normalizedQuery)
        );
    }, [members, habitSearch]);

    const canActOnRecord = (participantEmails: string[] | null | undefined) => {
        if (!currentUser) {
            return false;
        }

        const normalizedParticipants = participantEmails ?? [];
        return normalizedParticipants.length === 0 || normalizedParticipants.includes(currentUser.email);
    };

    const getAssignmentBadge = (participantEmails: string[] | null | undefined) => {
        if (!currentUser) {
            return { label: 'Простір', variant: 'blue' as const };
        }

        const normalizedParticipants = participantEmails ?? [];
        if (!normalizedParticipants.length) {
            return { label: 'Для всіх', variant: 'green' as const };
        }
        if (normalizedParticipants.includes(currentUser.email)) {
            return { label: 'Призначено мені', variant: 'purple' as const };
        }
        return { label: 'Призначено іншим', variant: 'slate' as const };
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

        setIsTaskSubmitting(true);

        const payload = {
            title: taskTitle.trim(),
            description: taskDesc.trim() || null,
            due_date: dueDateResult?.value ?? null,
            workspace_id: workspaceId,
            participant_emails: selectedTaskParticipantEmails,
        };

        try {
            if (taskModalMode === 'edit' && editingTaskId) {
                await apiClient.patch(`/tasks/${editingTaskId}`, payload);
            } else {
                await apiClient.post('/tasks/', payload);
            }

            resetTaskModal();
            await fetchTasks(0, true);
        } catch (error: any) {
            Alert.alert(
                'Помилка',
                error.response?.data?.detail ||
                    (taskModalMode === 'edit'
                        ? 'Не вдалося зберегти зміни у задачі простору'
                        : 'Не вдалося створити задачу простору')
            );
            setIsTaskSubmitting(false);
        }
    };

    const handleSubmitHabit = async () => {
        if (!habitTitle.trim()) {
            Alert.alert('Помилка', 'Введіть назву звички');
            return;
        }

        if (frequency === 'weekly' && weeklyDays.length === 0) {
            Alert.alert('Помилка', 'Виберіть хоча б один день тижня');
            return;
        }

        setIsHabitSubmitting(true);

        const payload = {
            title: habitTitle.trim(),
            frequency,
            target_days: buildTargetDays(),
            workspace_id: workspaceId,
            participant_emails: selectedHabitParticipantEmails,
        };

        try {
            if (habitModalMode === 'edit' && editingHabitId) {
                await apiClient.patch(`/habits/${editingHabitId}`, payload);
            } else {
                await apiClient.post('/habits/', payload);
            }

            resetHabitModal();
            await fetchHabits(0, true);
        } catch (error: any) {
            Alert.alert(
                'Помилка',
                error.response?.data?.detail ||
                    (habitModalMode === 'edit'
                        ? 'Не вдалося зберегти зміни у звичці простору'
                        : 'Не вдалося створити звичку простору')
            );
            setIsHabitSubmitting(false);
        }
    };

    const completeTask = async (taskId: string) => {
        setPendingTaskId(taskId);
        try {
            await apiClient.patch(`/tasks/${taskId}/status`, { status: 'completed' });
            await fetchTasks(0, true);
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося завершити задачу');
        } finally {
            setPendingTaskId((current) => (current === taskId ? null : current));
        }
    };

    const deleteTask = async (taskId: string) => {
        setPendingTaskId(taskId);
        try {
            await apiClient.delete(`/tasks/${taskId}`);
            await fetchTasks(0, true);
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося видалити задачу');
        } finally {
            setPendingTaskId((current) => (current === taskId ? null : current));
        }
    };

    const logHabit = async (habitId: string) => {
        setPendingHabitId(habitId);
        try {
            await apiClient.post(`/habits/${habitId}/log`);
            Alert.alert('Готово', 'Виконання звички зафіксовано.');
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося зафіксувати виконання');
        } finally {
            setPendingHabitId((current) => (current === habitId ? null : current));
        }
    };

    const deleteHabit = async (habitId: string) => {
        setPendingHabitId(habitId);
        try {
            await apiClient.delete(`/habits/${habitId}`);
            await fetchHabits(0, true);
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося видалити звичку');
        } finally {
            setPendingHabitId((current) => (current === habitId ? null : current));
        }
    };

    const loadMoreMembers = async () => {
        if (membersLoadingMore || !hasMoreMembers) {
            return;
        }

        setMembersLoadingMore(true);
        try {
            await fetchMembers(membersOffset, false);
        } catch {
            Alert.alert('Помилка', 'Не вдалося дозавантажити учасників');
        } finally {
            setMembersLoadingMore(false);
        }
    };

    const loadMoreTasks = async () => {
        if (tasksLoadingMore || !hasMoreTasks) {
            return;
        }

        setTasksLoadingMore(true);
        try {
            await fetchTasks(tasksOffset, false);
        } catch {
            Alert.alert('Помилка', 'Не вдалося дозавантажити задачі');
        } finally {
            setTasksLoadingMore(false);
        }
    };

    const loadMoreHabits = async () => {
        if (habitsLoadingMore || !hasMoreHabits) {
            return;
        }

        setHabitsLoadingMore(true);
        try {
            await fetchHabits(habitsOffset, false);
        } catch {
            Alert.alert('Помилка', 'Не вдалося дозавантажити звички');
        } finally {
            setHabitsLoadingMore(false);
        }
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
            <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
                <View style={styles.heroCard}>
                    <View style={styles.badgeRow}>
                        <RecordBadge label="Простір" variant="blue" />
                        <RecordBadge label={workspaceRole} variant="purple" />
                    </View>
                    <Text style={styles.heroTitle}>{workspaceName}</Text>
                    {workspaceDescription ? <Text style={styles.heroDescription}>{workspaceDescription}</Text> : null}
                </View>

                <TouchableOpacity
                    style={styles.historyCard}
                    onPress={() =>
                        navigation.navigate('WorkspaceHistory', {
                            workspaceId,
                            workspaceName,
                        })
                    }
                >
                    <View style={styles.historyCardContent}>
                        <View style={styles.badgeRow}>
                            <RecordBadge label="Історія" variant="green" />
                            <RecordBadge label="Аналітика простору" variant="blue" />
                        </View>
                        <Text style={styles.historyTitle}>Переглянути історію та аналітику простору</Text>
                        <Text style={styles.historyDescription}>
                            Завершені задачі, повтори звичок і помісячна активність учасників простору.
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#2563eb" />
                </TouchableOpacity>

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Задачі простору</Text>
                    {canManageWorkspaceContent ? (
                        <TouchableOpacity style={styles.sectionAction} onPress={openCreateTaskModal}>
                            <Ionicons name="add" size={16} color="#2563eb" />
                            <Text style={styles.sectionActionText}>Додати</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                <View style={styles.filterRow}>
                    {([
                        { label: 'Активні', value: 'active' },
                        { label: 'Виконані', value: 'completed' },
                    ] as { label: string; value: TaskStatusFilter }[]).map((filterOption) => (
                        <TouchableOpacity
                            key={filterOption.value}
                            style={[styles.filterChip, taskStatusFilter === filterOption.value && styles.filterChipActive]}
                            onPress={() => setTaskStatusFilter(filterOption.value)}
                        >
                            <Text
                                style={
                                    taskStatusFilter === filterOption.value
                                        ? styles.filterChipTextActive
                                        : styles.filterChipText
                                }
                            >
                                {filterOption.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={styles.filterRow}>
                    {([
                        { label: 'Усі', value: 'all' },
                        { label: 'Призначені мені', value: 'assigned_to_me' },
                        { label: 'Для всього простору', value: 'spacewide' },
                    ] as { label: string; value: TaskAssignmentFilter }[]).map((filterOption) => (
                        <TouchableOpacity
                            key={filterOption.value}
                            style={[
                                styles.scopeFilterChip,
                                taskAssignmentFilter === filterOption.value && styles.scopeFilterChipActive,
                            ]}
                            onPress={() => setTaskAssignmentFilter(filterOption.value)}
                        >
                            <Text
                                style={
                                    taskAssignmentFilter === filterOption.value
                                        ? styles.scopeFilterChipTextActive
                                        : styles.scopeFilterChipText
                                }
                            >
                                {filterOption.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {tasks.length ? (
                    <>
                        {tasks.map((task) => {
                            const participantEmails = task.participant_emails ?? [];
                            const canEdit = currentUser?.id === task.created_by;
                            const canAct = canActOnRecord(participantEmails);
                            const isPending = pendingTaskId === task.id;
                            const dueDateText = formatDueDate(task.due_date);
                            const completedAtText = formatCompletedAt(task.completed_at);
                            const assignmentBadge = getAssignmentBadge(participantEmails);

                            return (
                                <View key={task.id} style={styles.card}>
                                    <View style={styles.cardContent}>
                                        <View style={styles.badgeRow}>
                                            <RecordBadge label="Простір" variant="blue" />
                                            <RecordBadge label={assignmentBadge.label} variant={assignmentBadge.variant} />
                                            <RecordBadge
                                                label={task.status === 'completed' ? 'Виконано' : 'Активна'}
                                                variant={task.status === 'completed' ? 'green' : 'slate'}
                                            />
                                        </View>

                                        <Text style={styles.cardTitle}>{task.title}</Text>
                                        {task.description ? <Text style={styles.cardDescription}>{task.description}</Text> : null}
                                        {dueDateText ? <Text style={styles.metaText}>Дедлайн: {dueDateText}</Text> : null}
                                        {completedAtText ? <Text style={styles.metaText}>Виконано: {completedAtText}</Text> : null}
                                        <Text style={styles.metaText}>
                                            {participantEmails.length
                                                ? `Учасники: ${participantEmails.join(', ')}`
                                                : 'Задача для всього простору'}
                                        </Text>
                                    </View>

                                    <View style={styles.actions}>
                                        {canEdit ? (
                                            <>
                                                <TouchableOpacity
                                                    onPress={() => openEditTaskModal(task)}
                                                    style={[styles.iconButton, styles.editButton]}
                                                    disabled={isPending}
                                                >
                                                    <Ionicons name="create-outline" size={20} color="#1E88E5" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => deleteTask(task.id)}
                                                    style={[styles.iconButton, styles.deleteButton]}
                                                    disabled={isPending}
                                                >
                                                    <Ionicons name="trash-outline" size={20} color="#E53935" />
                                                </TouchableOpacity>
                                            </>
                                        ) : null}

                                        {canAct && task.status !== 'completed' ? (
                                            <TouchableOpacity
                                                onPress={() => completeTask(task.id)}
                                                style={[styles.iconButton, styles.completeButton]}
                                                disabled={isPending}
                                            >
                                                {isPending ? (
                                                    <ActivityIndicator size="small" color="#16a34a" />
                                                ) : (
                                                    <Ionicons name="checkmark-circle-outline" size={24} color="#16a34a" />
                                                )}
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                </View>
                            );
                        })}

                        {hasMoreTasks ? (
                            <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreTasks} disabled={tasksLoadingMore}>
                                <Text style={styles.loadMoreText}>
                                    {tasksLoadingMore
                                        ? 'Завантаження задач...'
                                        : taskStatusFilter === 'completed'
                                          ? 'Показати більше з історії'
                                          : 'Завантажити ще задачі'}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </>
                ) : (
                    <Text style={styles.emptyText}>
                        {taskStatusFilter === 'completed'
                            ? 'В історії ще немає виконаних задач для цього фільтра.'
                            : 'У просторі немає задач для цього фільтра.'}
                    </Text>
                )}

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Звички простору</Text>
                    {canManageWorkspaceContent ? (
                        <TouchableOpacity style={styles.sectionAction} onPress={openCreateHabitModal}>
                            <Ionicons name="add" size={16} color="#ea580c" />
                            <Text style={[styles.sectionActionText, { color: '#ea580c' }]}>Додати</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                <View style={styles.filterRow}>
                    {([
                        { label: 'Усі', value: 'all' },
                        { label: 'Мої', value: 'mine' },
                        { label: 'Для всього простору', value: 'spacewide' },
                    ] as { label: string; value: HabitAssignmentFilter }[]).map((filterOption) => (
                        <TouchableOpacity
                            key={filterOption.value}
                            style={[
                                styles.scopeFilterChip,
                                habitAssignmentFilter === filterOption.value && styles.scopeFilterChipActive,
                            ]}
                            onPress={() => setHabitAssignmentFilter(filterOption.value)}
                        >
                            <Text
                                style={
                                    habitAssignmentFilter === filterOption.value
                                        ? styles.scopeFilterChipTextActive
                                        : styles.scopeFilterChipText
                                }
                            >
                                {filterOption.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {habits.length ? (
                    <>
                        {habits.map((habit) => {
                            const participantEmails = habit.participant_emails ?? [];
                            const canEdit = currentUser?.id === habit.created_by;
                            const canAct = canActOnRecord(participantEmails);
                            const isPending = pendingHabitId === habit.id;
                            const assignmentBadge = getAssignmentBadge(participantEmails);

                            return (
                                <View key={habit.id} style={styles.card}>
                                    <View style={styles.cardContent}>
                                        <View style={styles.badgeRow}>
                                            <RecordBadge label="Простір" variant="blue" />
                                            <RecordBadge label={assignmentBadge.label} variant={assignmentBadge.variant} />
                                        </View>
                                        <Text style={styles.cardTitle}>{habit.title}</Text>
                                        <Text style={styles.habitFrequency}>{formatHabitFrequency(habit)}</Text>
                                        <Text style={styles.metaText}>
                                            {participantEmails.length
                                                ? `Учасники: ${participantEmails.join(', ')}`
                                                : 'Звичка для всього простору'}
                                        </Text>
                                    </View>

                                    <View style={styles.actions}>
                                        {canEdit ? (
                                            <>
                                                <TouchableOpacity
                                                    onPress={() => openEditHabitModal(habit)}
                                                    style={[styles.iconButton, styles.orangeEditButton]}
                                                    disabled={isPending}
                                                >
                                                    <Ionicons name="create-outline" size={20} color="#ea580c" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => deleteHabit(habit.id)}
                                                    style={[styles.iconButton, styles.deleteButton]}
                                                    disabled={isPending}
                                                >
                                                    <Ionicons name="trash-outline" size={20} color="#E53935" />
                                                </TouchableOpacity>
                                            </>
                                        ) : null}

                                        {canAct ? (
                                            <TouchableOpacity
                                                onPress={() => logHabit(habit.id)}
                                                style={[styles.iconButton, styles.logButton]}
                                                disabled={isPending}
                                            >
                                                {isPending ? (
                                                    <ActivityIndicator size="small" color="white" />
                                                ) : (
                                                    <Ionicons name="flash" size={20} color="white" />
                                                )}
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                </View>
                            );
                        })}

                        {hasMoreHabits ? (
                            <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreHabits} disabled={habitsLoadingMore}>
                                <Text style={styles.loadMoreText}>
                                    {habitsLoadingMore ? 'Завантаження звичок...' : 'Завантажити ще звички'}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </>
                ) : (
                    <Text style={styles.emptyText}>У просторі немає звичок для цього фільтра.</Text>
                )}
            </ScrollView>

            <Modal visible={taskModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.modalTitle}>
                            {taskModalMode === 'edit' ? 'Редагувати задачу простору' : 'Нова задача простору'}
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Назва задачі"
                            value={taskTitle}
                            onChangeText={setTaskTitle}
                        />
                        <TextInput
                            style={[styles.input, styles.multilineInput]}
                            placeholder="Опис"
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
                            label="Кому призначити"
                            helperText="Якщо нікого не вибрати, задача буде для всього простору."
                            searchPlaceholder="Пошук учасника"
                            searchValue={taskSearch}
                            onSearchChange={setTaskSearch}
                            users={filteredTaskMembers}
                            selectedEmails={selectedTaskParticipantEmails}
                            onToggle={(email) =>
                                setSelectedTaskParticipantEmails((prev) => toggleEmailSelection(prev, email))
                            }
                            emptyText="Немає учасників для вибору"
                            hasMore={hasMoreMembers}
                            isLoadingMore={membersLoadingMore}
                            onLoadMore={loadMoreMembers}
                            loadMoreText="Завантажити ще учасників"
                        />

                        {isTaskSubmitting ? (
                            <ActivityIndicator size="large" color="#2563eb" />
                        ) : (
                            <View style={styles.modalButtons}>
                                <Button title="Скасувати" color="gray" onPress={resetTaskModal} />
                                <Button
                                    title={taskModalMode === 'edit' ? 'Зберегти' : 'Створити'}
                                    onPress={handleSubmitTask}
                                />
                            </View>
                        )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal visible={habitModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.modalTitle}>
                            {habitModalMode === 'edit' ? 'Редагувати звичку простору' : 'Нова звичка простору'}
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Назва звички"
                            value={habitTitle}
                            onChangeText={setHabitTitle}
                        />

                        <Text style={styles.label}>Частота:</Text>
                        <View style={styles.frequencyRow}>
                            {(['daily', 'weekly', 'monthly'] as WorkspaceHabit['frequency'][]).map((value) => (
                                <TouchableOpacity
                                    key={value}
                                    style={[styles.frequencyButton, frequency === value && styles.frequencyButtonActive]}
                                    onPress={() => setFrequency(value)}
                                >
                                    <Text style={frequency === value ? styles.activeButtonText : styles.buttonText}>
                                        {value === 'daily' ? 'Щодня' : value === 'weekly' ? 'Щотижня' : 'Щомісяця'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {frequency === 'weekly' ? (
                            <>
                                <Text style={styles.label}>Дні тижня:</Text>
                                <View style={styles.selectionWrap}>
                                    {DAYS_OF_WEEK.map((day) => (
                                        <TouchableOpacity
                                            key={day.id}
                                            style={[
                                                styles.selectionChip,
                                                weeklyDays.includes(day.id) && styles.selectionChipActive,
                                            ]}
                                            onPress={() => toggleDay(day.id)}
                                        >
                                            <Text
                                                style={weeklyDays.includes(day.id) ? styles.activeButtonText : styles.buttonText}
                                            >
                                                {day.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        ) : null}

                        {frequency === 'monthly' ? (
                            <>
                                <Text style={styles.label}>Положення в місяці:</Text>
                                <View style={styles.selectionWrap}>
                                    {MONTHLY_POSITIONS.map((position) => (
                                        <TouchableOpacity
                                            key={position.value}
                                            style={[
                                                styles.selectionChip,
                                                monthlyPosition === position.value && styles.selectionChipActive,
                                            ]}
                                            onPress={() => setMonthlyPosition(position.value)}
                                        >
                                            <Text
                                                style={
                                                    monthlyPosition === position.value
                                                        ? styles.activeButtonText
                                                        : styles.buttonText
                                                }
                                            >
                                                {position.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={styles.label}>День тижня:</Text>
                                <View style={styles.selectionWrap}>
                                    {DAYS_OF_WEEK.map((day) => (
                                        <TouchableOpacity
                                            key={day.id}
                                            style={[
                                                styles.selectionChip,
                                                monthlyWeekday === day.id && styles.selectionChipActive,
                                            ]}
                                            onPress={() => setMonthlyWeekday(day.id)}
                                        >
                                            <Text
                                                style={
                                                    monthlyWeekday === day.id
                                                        ? styles.activeButtonText
                                                        : styles.buttonText
                                                }
                                            >
                                                {day.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        ) : null}

                        <UserSelectionList
                            label="Кому призначити"
                            helperText="Якщо нікого не вибрати, звичка буде для всього простору."
                            searchPlaceholder="Пошук учасника"
                            searchValue={habitSearch}
                            onSearchChange={setHabitSearch}
                            users={filteredHabitMembers}
                            selectedEmails={selectedHabitParticipantEmails}
                            onToggle={(email) =>
                                setSelectedHabitParticipantEmails((prev) => toggleEmailSelection(prev, email))
                            }
                            emptyText="Немає учасників для вибору"
                            hasMore={hasMoreMembers}
                            isLoadingMore={membersLoadingMore}
                            onLoadMore={loadMoreMembers}
                            loadMoreText="Завантажити ще учасників"
                        />

                        {isHabitSubmitting ? (
                            <ActivityIndicator size="large" color="#ea580c" />
                        ) : (
                            <View style={styles.modalButtons}>
                                <Button title="Скасувати" color="gray" onPress={resetHabitModal} />
                                <Button
                                    title={habitModalMode === 'edit' ? 'Зберегти' : 'Створити'}
                                    color="#ea580c"
                                    onPress={handleSubmitHabit}
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
    container: { flex: 1, backgroundColor: '#f3f4f6' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    heroCard: {
        backgroundColor: '#111827',
        margin: 16,
        borderRadius: 20,
        padding: 18,
    },
    heroTitle: { color: 'white', fontSize: 24, fontWeight: '700' },
    heroDescription: { color: '#d1d5db', fontSize: 14, marginTop: 8, lineHeight: 20 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    historyCard: {
        backgroundColor: '#ffffff',
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 18,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    historyCardContent: { flex: 1 },
    historyTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
    historyDescription: { marginTop: 6, color: '#4b5563', lineHeight: 20 },
    sectionHeader: {
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
    sectionAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
    },
    sectionActionText: { color: '#2563eb', fontWeight: '600' },
    filterRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginHorizontal: 16,
        marginBottom: 12,
    },
    filterChip: {
        flex: 1,
        minWidth: 120,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: '#e5e7eb',
        alignItems: 'center',
    },
    filterChipActive: { backgroundColor: '#2563eb' },
    filterChipText: { color: '#374151', fontWeight: '600', fontSize: 13 },
    filterChipTextActive: { color: 'white', fontWeight: '700', fontSize: 13 },
    scopeFilterChip: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    scopeFilterChipActive: {
        backgroundColor: '#111827',
        borderColor: '#111827',
    },
    scopeFilterChipText: { color: '#374151', fontWeight: '600', fontSize: 13 },
    scopeFilterChipTextActive: { color: 'white', fontWeight: '700', fontSize: 13 },
    card: {
        backgroundColor: 'white',
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    cardContent: { flex: 1, paddingRight: 12 },
    cardTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
    cardDescription: { fontSize: 14, color: '#4b5563', marginTop: 6 },
    metaText: { fontSize: 13, color: '#6b7280', marginTop: 6 },
    habitFrequency: { fontSize: 14, color: '#ea580c', marginTop: 4 },
    actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
        marginBottom: 8,
    },
    editButton: { backgroundColor: '#dbeafe' },
    orangeEditButton: { backgroundColor: '#ffedd5' },
    deleteButton: { backgroundColor: '#fee2e2' },
    completeButton: { backgroundColor: '#dcfce7' },
    logButton: { backgroundColor: '#ea580c' },
    emptyText: {
        textAlign: 'center',
        color: '#6b7280',
        marginHorizontal: 16,
        marginBottom: 20,
        backgroundColor: '#fff',
        padding: 18,
        borderRadius: 14,
    },
    loadMoreButton: {
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: '#fff',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    loadMoreText: {
        color: '#2563eb',
        fontWeight: '600',
    },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    modalContent: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        maxHeight: '92%',
    },
    modalTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
    input: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 10,
        padding: 10,
        marginBottom: 14,
        fontSize: 16,
        backgroundColor: '#fff',
    },
    multilineInput: { minHeight: 78, textAlignVertical: 'top' },
    label: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 8 },
    frequencyRow: { flexDirection: 'row', gap: 8, marginBottom: 15 },
    frequencyButton: {
        flex: 1,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 8,
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    frequencyButtonActive: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
    selectionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
    selectionChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 18,
        backgroundColor: '#fff',
    },
    selectionChipActive: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
    buttonText: { color: '#374151' },
    activeButtonText: { color: 'white', fontWeight: '700' },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
});

