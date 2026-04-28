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
import UserSelectionList, { SelectableUser } from '../components/UserSelectionList';
import apiClient from '../api/client';

type MonthlyPosition = 'first' | 'second' | 'third' | 'fourth' | 'last';

interface MonthlyPattern {
    week_of_month: MonthlyPosition;
    weekday: number;
}

type HabitTargetDays = number[] | MonthlyPattern | null;

interface Habit {
    id: string;
    title: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    target_days: HabitTargetDays;
    workspace_id: string | null;
    participant_emails?: string[] | null;
}

type HabitModalMode = 'create' | 'edit';

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

function isMonthlyPattern(value: HabitTargetDays): value is MonthlyPattern {
    return !!value && !Array.isArray(value) && typeof value === 'object';
}

function toggleEmailSelection(selectedEmails: string[], email: string) {
    return selectedEmails.includes(email)
        ? selectedEmails.filter((item) => item !== email)
        : [...selectedEmails, email];
}

function formatHabitFrequency(habit: Habit) {
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

export default function HabitsScreen() {
    const [habits, setHabits] = useState<Habit[]>([]);
    const [shareUsers, setShareUsers] = useState<SelectableUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState<HabitModalMode>('create');
    const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
    const [habitTitle, setHabitTitle] = useState('');
    const [frequency, setFrequency] = useState<Habit['frequency']>('daily');
    const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
    const [monthlyPosition, setMonthlyPosition] = useState<MonthlyPosition>('first');
    const [monthlyWeekday, setMonthlyWeekday] = useState<number>(0);
    const [selectedParticipantEmails, setSelectedParticipantEmails] = useState<string[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingHabitId, setPendingHabitId] = useState<string | null>(null);

    const fetchHabits = async () => {
        const response = await apiClient.get('/habits/');
        setHabits(response.data.filter((habit: Habit) => !habit.workspace_id));
    };

    const fetchShareUsers = async () => {
        const response = await apiClient.get('/users/');
        setShareUsers(response.data);
    };

    const loadHabits = useCallback(async () => {
        try {
            await Promise.all([fetchHabits(), fetchShareUsers()]);
        } catch {
            Alert.alert('Помилка', 'Не вдалося завантажити звички');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadHabits();
    }, [loadHabits]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadHabits();
    }, [loadHabits]);

    const resetModalState = () => {
        setModalVisible(false);
        setModalMode('create');
        setEditingHabitId(null);
        setHabitTitle('');
        setFrequency('daily');
        setWeeklyDays([]);
        setMonthlyPosition('first');
        setMonthlyWeekday(0);
        setSelectedParticipantEmails([]);
        setUserSearch('');
        setIsSubmitting(false);
    };

    const openCreateModal = () => {
        resetModalState();
        setModalVisible(true);
    };

    const openEditModal = (habit: Habit) => {
        setModalMode('edit');
        setEditingHabitId(habit.id);
        setHabitTitle(habit.title);
        setFrequency(habit.frequency);
        setSelectedParticipantEmails(habit.participant_emails ?? []);
        setUserSearch('');

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

        setModalVisible(true);
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

    const validateHabit = () => {
        if (!habitTitle.trim()) {
            return 'Введіть назву звички';
        }

        if (frequency === 'weekly' && weeklyDays.length === 0) {
            return 'Виберіть хоча б один день тижня';
        }

        return null;
    };

    const handleSubmitHabit = async () => {
        const validationError = validateHabit();
        if (validationError) {
            Alert.alert('Помилка', validationError);
            return;
        }

        setIsSubmitting(true);

        const payload = {
            title: habitTitle.trim(),
            frequency,
            target_days: buildTargetDays(),
            workspace_id: null,
            participant_emails: selectedParticipantEmails,
        };

        try {
            if (modalMode === 'edit' && editingHabitId) {
                await apiClient.patch(`/habits/${editingHabitId}`, payload);
            } else {
                await apiClient.post('/habits/', payload);
            }

            resetModalState();
            await fetchHabits();
        } catch (error: any) {
            Alert.alert(
                'Помилка',
                error.response?.data?.detail ||
                    (modalMode === 'edit' ? 'Не вдалося зберегти зміни у звичці' : 'Не вдалося створити звичку')
            );
            setIsSubmitting(false);
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
            setHabits((prev) => prev.filter((habit) => habit.id !== habitId));
        } catch (error: any) {
            Alert.alert('Помилка', error.response?.data?.detail || 'Не вдалося видалити звичку');
        } finally {
            setPendingHabitId((current) => (current === habitId ? null : current));
        }
    };

    const confirmDeleteHabit = (habit: Habit) => {
        Alert.alert(
            'Видалити звичку?',
            `Звичка "${habit.title}" буде видалена безповоротно.`,
            [
                { text: 'Скасувати', style: 'cancel' },
                {
                    text: 'Видалити',
                    style: 'destructive',
                    onPress: () => deleteHabit(habit.id),
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
        const personalHabits = habits.filter((habit) => !(habit.participant_emails ?? []).length);
        const sharedHabits = habits.filter((habit) => (habit.participant_emails ?? []).length > 0);

        return [
            { title: 'Мої звички', data: personalHabits },
            { title: 'Спільні звички', data: sharedHabits },
        ];
    }, [habits]);

    const renderFrequencyControls = () => (
        <>
            <Text style={styles.label}>Частота:</Text>
            <View style={styles.frequencyRow}>
                {(['daily', 'weekly', 'monthly'] as Habit['frequency'][]).map((value) => (
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
                                style={[styles.selectionChip, weeklyDays.includes(day.id) && styles.selectionChipActive]}
                                onPress={() => toggleDay(day.id)}
                            >
                                <Text style={weeklyDays.includes(day.id) ? styles.activeButtonText : styles.buttonText}>
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
        </>
    );

    const renderHabit = ({ item }: { item: Habit }) => {
        const isPending = pendingHabitId === item.id;
        const participantEmails = item.participant_emails ?? [];

        return (
            <View style={styles.card}>
                <View style={styles.cardContent}>
                    <View style={styles.badgeRow}>
                        <RecordBadge
                            label={participantEmails.length ? 'Спільне' : 'Особисте'}
                            variant={participantEmails.length ? 'purple' : 'orange'}
                        />
                    </View>
                    <Text style={styles.habitTitle}>{item.title}</Text>
                    <Text style={styles.habitFrequency}>{formatHabitFrequency(item)}</Text>
                    {participantEmails.length ? (
                        <Text style={styles.habitShare}>Разом з: {participantEmails.join(', ')}</Text>
                    ) : null}
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity
                        onPress={() => openEditModal(item)}
                        style={[styles.iconButton, styles.editButton]}
                        disabled={isPending}
                    >
                        <Ionicons name="create-outline" size={20} color="#FB8C00" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => confirmDeleteHabit(item)}
                        style={[styles.iconButton, styles.deleteButton]}
                        disabled={isPending}
                    >
                        <Ionicons name="trash-outline" size={20} color="#E53935" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => logHabit(item.id)}
                        style={[styles.iconButton, styles.logButton]}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <Ionicons name="flash" size={20} color="white" />
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
                renderItem={renderHabit}
                renderSectionHeader={({ section }) => (
                    <Text style={styles.sectionTitle}>
                        {section.title} ({section.data.length})
                    </Text>
                )}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={<Text style={styles.emptyText}>Ще немає звичок. Час створити першу.</Text>}
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
                            {modalMode === 'edit' ? 'Редагувати звичку' : 'Нова звичка'}
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Назва звички"
                            value={habitTitle}
                            onChangeText={setHabitTitle}
                        />

                        {renderFrequencyControls()}

                        <UserSelectionList
                            label="Спільний доступ"
                            helperText="Оберіть користувачів для спільної звички. Без вибору звичка залишиться особистою."
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
                            <ActivityIndicator size="large" color="#FF9800" style={{ marginTop: 15 }} />
                        ) : (
                            <View style={styles.modalButtons}>
                                <Button title="Скасувати" color="gray" onPress={resetModalState} />
                                <Button
                                    title={modalMode === 'edit' ? 'Зберегти' : 'Створити'}
                                    color="#FF9800"
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
    habitTitle: { fontSize: 18, fontWeight: '600' },
    habitFrequency: { fontSize: 14, color: '#FF9800', marginTop: 4 },
    habitShare: { fontSize: 13, color: '#6b7280', marginTop: 4 },
    actions: { flexDirection: 'row', alignItems: 'center' },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    editButton: { backgroundColor: '#FFF3E0' },
    deleteButton: { backgroundColor: '#FFEBEE' },
    logButton: { backgroundColor: '#FF9800' },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: 'gray' },
    fab: {
        position: 'absolute',
        width: 60,
        height: 60,
        alignItems: 'center',
        justifyContent: 'center',
        right: 20,
        bottom: 20,
        backgroundColor: '#FF9800',
        borderRadius: 30,
        elevation: 8,
    },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
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
    label: { fontSize: 16, marginBottom: 8, color: '#333', fontWeight: '600' },
    frequencyRow: { flexDirection: 'row', gap: 8, marginBottom: 15 },
    frequencyButton: {
        flex: 1,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    frequencyButtonActive: { backgroundColor: '#FF9800', borderColor: '#FF9800' },
    selectionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
    selectionChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 18,
        backgroundColor: '#fff',
    },
    selectionChipActive: { backgroundColor: '#FF9800', borderColor: '#FF9800' },
    buttonText: { color: '#333' },
    activeButtonText: { color: 'white', fontWeight: 'bold' },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
});
