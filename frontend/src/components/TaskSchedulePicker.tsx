import React, { useMemo, useState } from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TaskSchedulePickerProps {
    dateValue: string;
    onDateChange: (value: string) => void;
    onTimeChange: (value: string) => void;
    timeValue: string;
}

interface CalendarDayCell {
    dateString: string;
    dayNumber: number;
    isCurrentMonth: boolean;
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MONTH_LABELS = [
    'Січень',
    'Лютий',
    'Березень',
    'Квітень',
    'Травень',
    'Червень',
    'Липень',
    'Серпень',
    'Вересень',
    'Жовтень',
    'Листопад',
    'Грудень',
];
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function parseDateString(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const [year, month, day] = value.split('-').map(Number);
    const parsedDate = new Date(year, month - 1, day);

    if (
        parsedDate.getFullYear() !== year ||
        parsedDate.getMonth() !== month - 1 ||
        parsedDate.getDate() !== day
    ) {
        return null;
    }

    return parsedDate;
}

function formatDateString(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
    ).padStart(2, '0')}`;
}

function formatDateLabel(value: string) {
    const parsedDate = parseDateString(value);
    if (!parsedDate) {
        return 'Оберіть дату';
    }

    return `${String(parsedDate.getDate()).padStart(2, '0')} ${
        MONTH_LABELS[parsedDate.getMonth()]
    } ${parsedDate.getFullYear()}`;
}

function formatTimeLabel(value: string) {
    return /^\d{2}:\d{2}$/.test(value) ? value : 'Оберіть час';
}

function buildCalendarDays(cursor: Date): CalendarDayCell[] {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const firstWeekday = (firstDayOfMonth.getDay() + 6) % 7;
    const firstVisibleDay = new Date(year, month, 1 - firstWeekday);

    return Array.from({ length: 42 }, (_, index) => {
        const dayDate = new Date(firstVisibleDay);
        dayDate.setDate(firstVisibleDay.getDate() + index);

        return {
            dateString: formatDateString(dayDate),
            dayNumber: dayDate.getDate(),
            isCurrentMonth: dayDate.getMonth() === month,
        };
    });
}

export default function TaskSchedulePicker({
    dateValue,
    onDateChange,
    onTimeChange,
    timeValue,
}: TaskSchedulePickerProps) {
    const parsedDate = parseDateString(dateValue);
    const initialCursor = parsedDate ?? new Date();
    const [dateModalVisible, setDateModalVisible] = useState(false);
    const [timeModalVisible, setTimeModalVisible] = useState(false);
    const [calendarCursor, setCalendarCursor] = useState(
        new Date(initialCursor.getFullYear(), initialCursor.getMonth(), 1)
    );
    const [draftHour, setDraftHour] = useState(timeValue.slice(0, 2) || '23');
    const [draftMinute, setDraftMinute] = useState(timeValue.slice(3, 5) || '59');

    const calendarDays = useMemo(() => buildCalendarDays(calendarCursor), [calendarCursor]);

    const openDateModal = () => {
        const currentDate = parseDateString(dateValue) ?? new Date();
        setCalendarCursor(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
        setDateModalVisible(true);
    };

    const openTimeModal = () => {
        const [hour = '23', minute = '59'] = /^\d{2}:\d{2}$/.test(timeValue)
            ? timeValue.split(':')
            : ['23', '59'];
        setDraftHour(hour);
        setDraftMinute(minute);
        setTimeModalVisible(true);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.label}>Дедлайн</Text>

            <View style={styles.row}>
                <TouchableOpacity style={styles.pickerButton} onPress={openDateModal}>
                    <Ionicons name="calendar-outline" size={18} color="#2563eb" />
                    <Text style={styles.pickerButtonText}>{formatDateLabel(dateValue)}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.pickerButton, !dateValue && styles.pickerButtonDisabled]}
                    onPress={openTimeModal}
                    disabled={!dateValue}
                >
                    <Ionicons name="time-outline" size={18} color={dateValue ? '#2563eb' : '#9ca3af'} />
                    <Text style={[styles.pickerButtonText, !dateValue && styles.pickerButtonTextDisabled]}>
                        {formatTimeLabel(timeValue)}
                    </Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.clearButton}
                onPress={() => {
                    onDateChange('');
                    onTimeChange('');
                }}
            >
                <Text style={styles.clearButtonText}>Очистити дедлайн</Text>
            </TouchableOpacity>

            <Modal visible={dateModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity
                                style={styles.headerIconButton}
                                onPress={() =>
                                    setCalendarCursor(
                                        new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1)
                                    )
                                }
                            >
                                <Ionicons name="chevron-back" size={20} color="#111827" />
                            </TouchableOpacity>

                            <Text style={styles.modalTitle}>
                                {MONTH_LABELS[calendarCursor.getMonth()]} {calendarCursor.getFullYear()}
                            </Text>

                            <TouchableOpacity
                                style={styles.headerIconButton}
                                onPress={() =>
                                    setCalendarCursor(
                                        new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1)
                                    )
                                }
                            >
                                <Ionicons name="chevron-forward" size={20} color="#111827" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.weekdayRow}>
                            {WEEKDAY_LABELS.map((label) => (
                                <Text key={label} style={styles.weekdayText}>
                                    {label}
                                </Text>
                            ))}
                        </View>

                        <View style={styles.calendarGrid}>
                            {calendarDays.map((day) => {
                                const isSelected = day.dateString === dateValue;

                                return (
                                    <TouchableOpacity
                                        key={day.dateString}
                                        style={[
                                            styles.dayCell,
                                            isSelected && styles.dayCellSelected,
                                            !day.isCurrentMonth && styles.dayCellMuted,
                                        ]}
                                        onPress={() => {
                                            onDateChange(day.dateString);
                                            setDateModalVisible(false);
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.dayCellText,
                                                isSelected && styles.dayCellTextSelected,
                                                !day.isCurrentMonth && styles.dayCellTextMuted,
                                            ]}
                                        >
                                            {day.dayNumber}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.secondaryAction} onPress={() => setDateModalVisible(false)}>
                                <Text style={styles.secondaryActionText}>Закрити</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.primaryAction}
                                onPress={() => {
                                    const today = new Date();
                                    onDateChange(formatDateString(today));
                                    setDateModalVisible(false);
                                }}
                            >
                                <Text style={styles.primaryActionText}>Сьогодні</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={timeModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Оберіть час</Text>

                        <View style={styles.timeColumns}>
                            <View style={styles.timeColumn}>
                                <Text style={styles.timeColumnLabel}>Години</Text>
                                <ScrollView style={styles.timeList} showsVerticalScrollIndicator={false}>
                                    {HOURS.map((hour) => (
                                        <TouchableOpacity
                                            key={hour}
                                            style={[styles.timeOption, draftHour === hour && styles.timeOptionSelected]}
                                            onPress={() => setDraftHour(hour)}
                                        >
                                            <Text
                                                style={[
                                                    styles.timeOptionText,
                                                    draftHour === hour && styles.timeOptionTextSelected,
                                                ]}
                                            >
                                                {hour}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            <View style={styles.timeColumn}>
                                <Text style={styles.timeColumnLabel}>Хвилини</Text>
                                <ScrollView style={styles.timeList} showsVerticalScrollIndicator={false}>
                                    {MINUTES.map((minute) => (
                                        <TouchableOpacity
                                            key={minute}
                                            style={[
                                                styles.timeOption,
                                                draftMinute === minute && styles.timeOptionSelected,
                                            ]}
                                            onPress={() => setDraftMinute(minute)}
                                        >
                                            <Text
                                                style={[
                                                    styles.timeOptionText,
                                                    draftMinute === minute && styles.timeOptionTextSelected,
                                                ]}
                                            >
                                                {minute}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.secondaryAction} onPress={() => setTimeModalVisible(false)}>
                                <Text style={styles.secondaryActionText}>Скасувати</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.primaryAction}
                                onPress={() => {
                                    onTimeChange(`${draftHour}:${draftMinute}`);
                                    setTimeModalVisible(false);
                                }}
                            >
                                <Text style={styles.primaryActionText}>Готово</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginBottom: 16 },
    label: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 8 },
    row: { flexDirection: 'row', gap: 10 },
    pickerButton: {
        flex: 1,
        minHeight: 50,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: '#fff',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pickerButtonDisabled: { backgroundColor: '#f3f4f6' },
    pickerButtonText: { color: '#111827', fontSize: 15, flexShrink: 1 },
    pickerButtonTextDisabled: { color: '#9ca3af' },
    clearButton: { marginTop: 10, alignSelf: 'flex-start' },
    clearButtonText: { color: '#dc2626', fontWeight: '600' },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: 'rgba(17,24,39,0.45)',
        padding: 20,
    },
    modalCard: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 18,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    headerIconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        textAlign: 'center',
    },
    weekdayRow: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    weekdayText: {
        width: '14.2857%',
        textAlign: 'center',
        color: '#6b7280',
        fontWeight: '600',
        fontSize: 12,
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.2857%',
        aspectRatio: 1,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        marginBottom: 6,
    },
    dayCellSelected: { backgroundColor: '#2563eb' },
    dayCellMuted: { opacity: 0.45 },
    dayCellText: { color: '#111827', fontWeight: '600' },
    dayCellTextSelected: { color: '#fff' },
    dayCellTextMuted: { color: '#6b7280' },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 18,
        gap: 10,
    },
    secondaryAction: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#e5e7eb',
        alignItems: 'center',
    },
    secondaryActionText: { color: '#374151', fontWeight: '700' },
    primaryAction: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#2563eb',
        alignItems: 'center',
    },
    primaryActionText: { color: '#fff', fontWeight: '700' },
    timeColumns: { flexDirection: 'row', gap: 12, marginTop: 16 },
    timeColumn: { flex: 1 },
    timeColumnLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
        textAlign: 'center',
    },
    timeList: {
        maxHeight: 220,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 14,
        backgroundColor: '#f9fafb',
    },
    timeOption: {
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    timeOptionSelected: { backgroundColor: '#dbeafe' },
    timeOptionText: { color: '#111827', fontWeight: '600' },
    timeOptionTextSelected: { color: '#1d4ed8' },
});
