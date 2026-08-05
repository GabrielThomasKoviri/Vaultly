import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FileThumb from './FileThumb';
import { formatSize, timeAgo, getFileTypeLabel } from '../utils/fileUtils';

export default function ListCard({ item, selected, selectionMode, onPress, onLongPress, onMenu, accent, colors }) {
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}
      style={[styles.listCard, { backgroundColor: colors.cardBg, borderColor: selected ? accent : colors.border }]}>
      <View style={{ marginRight: 12 }}>
        {selectionMode ? (
          <View style={{ width: 42, height: 42, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={selected ? accent : colors.subtext} />
          </View>
        ) : (
          <FileThumb item={item} size={48} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text numberOfLines={1} style={[styles.listCardName, { color: colors.text, flexShrink: 1 }]}>{item.name}</Text>
          {item.is_favorite === 1 && (
            <Ionicons name="star" size={14} color={accent} style={{ marginLeft: 6 }} />
          )}
        </View>
        <Text numberOfLines={1} style={[styles.listCardMeta, { color: colors.subtext }]}>
          {timeAgo(item.created_at)}, {formatSize(item.size)}, {getFileTypeLabel(item)}
        </Text>
      </View>
      {!selectionMode && (
        <TouchableOpacity onPress={onMenu} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 6 }}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.subtext} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1
  },
  listCardName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3
  },
  listCardMeta: {
    fontSize: 11
  }
});
