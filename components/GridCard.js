import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FileThumb from './FileThumb';
import { formatSize } from '../utils/fileUtils';

export default function GridCard({ item, selected, selectionMode, onPress, onLongPress, accent, colors }) {
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}
      style={[
        styles.gridCard,
        {
          borderWidth: 1.5,
          borderColor: selected ? accent : 'transparent',
          borderRadius: 12,
          backgroundColor: selected ? colors.iconBg : 'transparent'
        }
      ]}>
      <View style={{ position: 'relative' }}>
        <FileThumb item={item} size={90} />
        {item.is_favorite === 1 && (
          <View style={{
            position: 'absolute',
            top: 6,
            left: 6,
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderRadius: 10,
            padding: 3,
            zIndex: 3
          }}>
            <Ionicons name="star" size={12} color={accent} />
          </View>
        )}
      </View>
      {selectionMode && (
        <View style={[styles.gridCardCheck, { borderColor: selected ? accent : colors.subtext, backgroundColor: selected ? accent : 'transparent' }]}>
          {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
      )}
      <Text numberOfLines={1} style={[styles.gridCardName, { color: colors.text }]}>{item.name}</Text>
      <Text style={[styles.gridCardMeta, { color: colors.subtext }]}>{formatSize(item.size)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gridCard: {
    width: '31.3%',
    margin: '1%',
    overflow: 'hidden',
    padding: 8,
    alignItems: 'center'
  },
  gridCardCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center'
  },
  gridCardName: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center'
  },
  gridCardMeta: {
    fontSize: 10,
    marginTop: 2,
    marginBottom: 4
  }
});
