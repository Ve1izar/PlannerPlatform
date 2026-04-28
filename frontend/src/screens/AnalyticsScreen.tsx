import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import apiClient from '../api/client';

type PeriodValue = 3 | 6 | 12;

interface MonthOption {
    value: string;
    label: string;
    completed_tasks: number;
    habit_logs: number;
}

interface TaskLogItem {
    id: string;
    title: string;
    completed_at: string;
}

interface HabitLogItem {
    id: string;
    habit_id: string;
    title: string;
    completed_at: string;
}

interface AnalyticsResponse {
    completed_tasks: number;
    habit_logs: number;
    available_months: MonthOption[];
    selected_month: string;
    task_logs: TaskLogItem[];
    habit_completion_logs: HabitLogItem[];
}

const PERIOD_OPTIONS: { value: PeriodValue; label: string }[] = [
    { value: 3, label: '3 місяці' },
    { value: 6, label: 'Пів року' },
    { value: 12, label: 'Рік' },
];

function formatLogTime(value: string) {
    const normalized = value.replace(' ', 'T');
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
        return normalized.slice(0, 16).replace('T', ' ');
    }

    return `${date.toLocaleDateString('uk-UA')} ${date.toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
    })}`;
}

function PieChart({
    completedTasks,
    habitLogs,
}: {
    completedTasks: number;
    habitLogs: number;
}) {
    const total = completedTasks + habitLogs;
    const taskPercent = total === 0 ? 50 : (completedTasks / total) * 100;

    if (Platform.OS === 'web') {
        return React.createElement(
            'div' as any,
            {
                style: {
                    width: 180,
                    height: 180,
                    borderRadius: '50%',
                    background: `conic-gradient(#2196F3 0 ${taskPercent}%, #FF9800 ${taskPercent}% 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto',
                },
            },
            React.createElement(
                'div' as any,
                {
                    style: {
                        width: 92,
                        height: 92,
                        borderRadius: '50%',
                        background: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        fontWeight: 700,
                        color: '#111827',
                        fontFamily: 'sans-serif',
                        lineHeight: 1.2,
                    },
                },
                `${total}\nподій`
            )
        );
    }

    return (
        <View style={styles.fallbackChart}>
            <Text style={styles.fallbackChartText}>{total}</Text>
            <Text style={styles.fallbackChartSubtext}>подій за період</Text>
        </View>
    );
}

export default function AnalyticsScreen() {
    const [period, setPeriod] = useState<PeriodValue>(3);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setSelectedMonth(null);
    }, [period]);

    useEffect(() => {
        let isMounted = true;

        const fetchAnalytics = async () => {
            setIsLoading(true);
            try {
                const response = await apiClient.get('/analytics/overview', {
                    params: {
                        range_months: period,
                        month: selectedMonth ?? undefined,
                    },
                });

                if (!isMounted) {
                    return;
                }

                setAnalytics(response.data);
                if (!selectedMonth || selectedMonth !== response.data.selected_month) {
                    setSelectedMonth(response.data.selected_month);
                }
            } catch {
                if (isMounted) {
                    Alert.alert('Помилка', 'Не вдалося завантажити аналітику');
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchAnalytics();

        return () => {
            isMounted = false;
        };
    }, [period, selectedMonth]);

    const totalEvents = useMemo(() => {
        if (!analytics) {
            return 0;
        }

        return analytics.completed_tasks + analytics.habit_logs;
    }, [analytics]);

    if (isLoading && !analytics) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Період</Text>
                <View style={styles.chipRow}>
                    {PERIOD_OPTIONS.map((option) => (
                        <TouchableOpacity
                            key={option.value}
                            style={[styles.chip, period === option.value && styles.chipActive]}
                            onPress={() => setPeriod(option.value)}
                        >
                            <Text style={period === option.value ? styles.chipTextActive : styles.chipText}>
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.chartCard}>
                <Text style={styles.sectionTitle}>Співвідношення виконань</Text>
                <PieChart
                    completedTasks={analytics?.completed_tasks ?? 0}
                    habitLogs={analytics?.habit_logs ?? 0}
                />

                <View style={styles.legendList}>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: '#2196F3' }]} />
                        <Text style={styles.legendText}>
                            Завдання: {analytics?.completed_tasks ?? 0}
                        </Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: '#FF9800' }]} />
                        <Text style={styles.legendText}>
                            Повторення звичок: {analytics?.habit_logs ?? 0}
                        </Text>
                    </View>
                    <Text style={styles.totalText}>Усього: {totalEvents}</Text>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Місяць для логів</Text>
                <View style={styles.monthWrap}>
                    {analytics?.available_months.map((month) => (
                        <TouchableOpacity
                            key={month.value}
                            style={[
                                styles.monthChip,
                                analytics.selected_month === month.value && styles.monthChipActive,
                            ]}
                            onPress={() => setSelectedMonth(month.value)}
                        >
                            <Text
                                style={
                                    analytics.selected_month === month.value
                                        ? styles.monthChipTextActive
                                        : styles.monthChipText
                                }
                            >
                                {month.label}
                            </Text>
                            <Text
                                style={
                                    analytics.selected_month === month.value
                                        ? styles.monthChipCountActive
                                        : styles.monthChipCount
                                }
                            >
                                {month.completed_tasks + month.habit_logs}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.logsSection}>
                <Text style={styles.sectionTitle}>Виконані завдання</Text>
                {analytics?.task_logs.length ? (
                    analytics.task_logs.map((task) => (
                        <View key={task.id} style={styles.logCard}>
                            <Text style={styles.logTitle}>{task.title}</Text>
                            <Text style={styles.logMeta}>{formatLogTime(task.completed_at)}</Text>
                        </View>
                    ))
                ) : (
                    <Text style={styles.emptyText}>Немає виконаних завдань за обраний місяць.</Text>
                )}
            </View>

            <View style={styles.logsSection}>
                <Text style={styles.sectionTitle}>Повторення звичок</Text>
                {analytics?.habit_completion_logs.length ? (
                    analytics.habit_completion_logs.map((habitLog) => (
                        <View key={habitLog.id} style={styles.logCard}>
                            <Text style={styles.logTitle}>{habitLog.title}</Text>
                            <Text style={styles.logMeta}>{formatLogTime(habitLog.completed_at)}</Text>
                        </View>
                    ))
                ) : (
                    <Text style={styles.emptyText}>Немає повторень звичок за обраний місяць.</Text>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    content: { padding: 16, gap: 16 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    section: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 16,
        elevation: 2,
    },
    chartCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        elevation: 2,
        alignItems: 'center',
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#111827' },
    chipRow: { flexDirection: 'row', gap: 8 },
    chip: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#d1d5db',
        alignItems: 'center',
    },
    chipActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
    chipText: { color: '#374151', fontWeight: '600' },
    chipTextActive: { color: 'white', fontWeight: '700' },
    legendList: { marginTop: 20, width: '100%', gap: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendColor: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
    legendText: { fontSize: 15, color: '#374151' },
    totalText: { marginTop: 4, fontSize: 15, fontWeight: '700', color: '#111827' },
    fallbackChart: {
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: '#eef2ff',
        borderWidth: 14,
        borderColor: '#c7d2fe',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fallbackChartText: { fontSize: 32, fontWeight: '800', color: '#111827' },
    fallbackChartSubtext: { marginTop: 6, fontSize: 13, color: '#4b5563' },
    monthWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    monthChip: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#d1d5db',
        minWidth: 88,
        alignItems: 'center',
    },
    monthChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
    monthChipText: { color: '#374151', fontWeight: '600' },
    monthChipTextActive: { color: 'white', fontWeight: '700' },
    monthChipCount: { marginTop: 4, color: '#6b7280', fontSize: 12 },
    monthChipCountActive: { marginTop: 4, color: '#dbeafe', fontSize: 12 },
    logsSection: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 16,
        elevation: 2,
    },
    logCard: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    logTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
    logMeta: { marginTop: 4, fontSize: 13, color: '#6b7280' },
    emptyText: { fontSize: 14, color: '#6b7280' },
});
