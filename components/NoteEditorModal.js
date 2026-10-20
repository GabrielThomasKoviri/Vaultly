import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../ThemeContext';
import Alert from '../customAlert';

export default function NoteEditorModal({
  visible,
  noteItem = null,
  onClose,
  onSave,
  onDelete,
  onShare,
}) {
  const { mode, colors, accent } = useTheme();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const isEditing = !!noteItem;

  useEffect(() => {
    if (!visible) {
      setTitle('');
      setContent('');
      setTags('');
      setInitialLoaded(false);
      return;
    }

    if (noteItem) {
      setLoading(true);
      (async () => {
        try {
          let text = '';
          if (noteItem.file_path) {
            const info = await FileSystem.getInfoAsync(noteItem.file_path).catch(() => ({ exists: false }));
            if (info.exists) {
              text = await FileSystem.readAsStringAsync(noteItem.file_path).catch(() => '');
            }
          }
          let cleanTitle = noteItem.name || 'Untitled Note';
          if (cleanTitle.toLowerCase().endsWith('.txt')) {
            cleanTitle = cleanTitle.slice(0, -4);
          }
          setTitle(cleanTitle);
          setContent(text || '');
          setTags(noteItem.tags || '');
        } catch (e) {
          console.error('Failed to load note content:', e.message);
          Alert.alert('Error', 'Could not read note text.');
        } finally {
          setLoading(false);
          setInitialLoaded(true);
        }
      })();
    } else {
      setTitle('');
      setContent('');
      setTags('');
      setInitialLoaded(true);
    }
  }, [visible, noteItem]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, title, content, tags, isEditing]);

  const handleClose = () => {
    if (content.trim() || title.trim()) {
      if (!isEditing) {
        Alert.alert('Discard Note?', 'You have unsaved text. Are you sure you want to close?', [
          { text: 'Keep Editing' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ]);
        return;
      }
    }
    onClose();
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim() || 'Untitled Note';
    if (!content.trim() && !title.trim()) {
      Alert.alert('Empty Note', 'Please enter a title or note content.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title: trimmedTitle,
        content,
        tags: tags.trim(),
        item: noteItem,
      });
      onClose();
    } catch (e) {
      console.error('Failed to save note:', e.message);
      Alert.alert('Save Failed', 'Could not save note: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Header */}
        <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleClose} style={[styles.headerBtn, { backgroundColor: colors.iconBg }]}>
            <Ionicons name="arrow-back" size={20} color={accent} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {isEditing ? 'Edit Note' : 'New Note'}
            </Text>
            <Text style={[styles.headerMeta, { color: colors.subtext }]}>
              {wordCount} words • {charCount} chars
            </Text>
          </View>

          <View style={styles.headerRightActions}>
            {isEditing && onShare && (
              <TouchableOpacity
                onPress={() => onShare(noteItem)}
                style={[styles.headerBtn, { backgroundColor: colors.iconBg }]}
              >
                <Ionicons name="share-social-outline" size={18} color={accent} />
              </TouchableOpacity>
            )}

            {isEditing && onDelete && (
              <TouchableOpacity
                onPress={() => {
                  Alert.alert('Delete Note', 'Delete this note permanently?', [
                    { text: 'Cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        onClose();
                        onDelete(noteItem);
                      },
                    },
                  ]);
                }}
                style={[styles.headerBtn, { backgroundColor: colors.iconBg }]}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || loading}
              style={[
                styles.saveBtn,
                { backgroundColor: accent, opacity: saving || loading ? 0.6 : 1 },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.saveBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={[styles.loadingText, { color: colors.subtext }]}>Loading note...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.editorScroll}
            contentContainerStyle={styles.editorContentContainer}
            keyboardShouldPersistTaps="handled"
          >
            {/* Note Title Input */}
            <TextInput
              style={[
                styles.titleInput,
                {
                  color: colors.text,
                  borderBottomColor: colors.border,
                },
              ]}
              placeholder="Note Title"
              placeholderTextColor={colors.subtext}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
            />

            {/* Tags Input */}
            <View style={[styles.tagsRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Ionicons name="pricetag-outline" size={16} color={accent} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.tagsInput, { color: colors.text }]}
                placeholder="Tags (comma separated, e.g. work, passwords)"
                placeholderTextColor={colors.subtext}
                value={tags}
                onChangeText={setTags}
              />
            </View>

            {/* Note Body Text Input */}
            <TextInput
              style={[
                styles.bodyInput,
                {
                  color: colors.text,
                  backgroundColor: colors.cardBg,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Write your secure note here..."
              placeholderTextColor={colors.subtext}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              autoFocus={!isEditing}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
  },
  editorScroll: {
    flex: 1,
  },
  editorContentContainer: {
    padding: 16,
    flexGrow: 1,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 8,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  tagsInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  bodyInput: {
    flex: 1,
    minHeight: 380,
    fontSize: 15,
    lineHeight: 22,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
});
