import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type BadgeVariant = 'blue' | 'green' | 'orange' | 'purple' | 'slate';

interface RecordBadgeProps {
    label: string;
    variant?: BadgeVariant;
}

const VARIANT_STYLES: Record<BadgeVariant, { backgroundColor: string; color: string }> = {
    blue: { backgroundColor: '#DBEAFE', color: '#1D4ED8' },
    green: { backgroundColor: '#DCFCE7', color: '#15803D' },
    orange: { backgroundColor: '#FFEDD5', color: '#C2410C' },
    purple: { backgroundColor: '#EDE9FE', color: '#6D28D9' },
    slate: { backgroundColor: '#E5E7EB', color: '#374151' },
};

export default function RecordBadge({ label, variant = 'slate' }: RecordBadgeProps) {
    const variantStyle = VARIANT_STYLES[variant];

    return (
        <View style={[styles.badge, { backgroundColor: variantStyle.backgroundColor }]}>
            <Text style={[styles.badgeText, { color: variantStyle.color }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
});
