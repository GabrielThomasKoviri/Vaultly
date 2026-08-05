import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  SectionList,
  StyleSheet,
  Text, TextInput,
  ToastAndroid,
  TouchableOpacity,
  View
} from 'react-native';
import CameraScreen from './CameraScreen';
import Alert from './customAlert';
import { addItem, deleteItem, getItems, getLocalUriByHash, getSetting, renameItem, setSetting, toggleFavorite } from './db';
import { pickerActive } from './pickerState';
import SettingsScreen from './SettingsScreen';
import { useTheme } from './ThemeContext';

// Components
import FileThumb from './components/FileThumb';
import ListCard from './components/ListCard';
import GridCard from './components/GridCard';

// Utilities
import {
  CATEGORIES,
  IMAGE_EXTS,
  VIDEO_EXTS,
  getExt,
  getCategory,
  formatSize,
  timeAgo,
  getFileTypeLabel
} from './utils/fileUtils';

const VAULT_DIR = FileSystem.documentDirectory + 'vault/';

function groupByMonth(items) {
  const groups = {};
  items.forEach(item => {
    const d = new Date(item.created_at || Date.now());
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase();
    if (!groups[key]) groups[key] = { title: label, data: [] };
    groups[key].data.push(item);
  });
  return Object.values(groups);
}

function chunkByThree(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push(items.slice(i, i + 3));
  }
  return rows;
}

function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatch(text, query) {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  // 1. Direct substring match
  if (t.includes(q)) return true;

  // 2. Subsequence match
  if (q.length >= 3) {
    let i = 0, j = 0;
    while (i < t.length && j < q.length) {
      if (t[i] === q[j]) j++;
      i++;
    }
    if (j === q.length) return true;
  }

  // 3. Edit distance for typos
  if (q.length >= 3) {
    const distance = getLevenshteinDistance(t, q);
    const allowedDistance = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
    if (distance <= allowedDistance) return true;

    const words = t.split(/[\s_\-\.]+/);
    for (const word of words) {
      if (word.length >= 3) {
        const wordDist = getLevenshteinDistance(word, q);
        const wordAllowed = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
        if (wordDist <= wordAllowed) return true;
      }
    }
  }

  return false;
}

function getEmptyStateContent(cat) {
  switch (cat) {
    case 'doc':
      return {
        title: 'No documents in your vault',
        text: 'Tap + to add a document'
      };
    case 'media':
      return {
        title: 'No media files in your vault',
        text: 'Tap + to add an image or video'
      };
    case 'web':
      return {
        title: 'No web pages in your vault',
        text: 'Tap + to add a web page'
      };
    case 'audio':
      return {
        title: 'No audio files in your vault',
        text: 'Tap + to add an audio track'
      };
    case 'other':
      return {
        title: 'No other files in your vault',
        text: 'Tap + to add a file'
      };
    case 'favorites':
      return {
        title: 'No favorites added yet',
        text: 'Long-press a file and select "Add to Favorites"'
      };
    default:
      return {
        title: 'Your vault is empty',
        text: 'Tap + to add your first file'
      };
  }
}

export default function Home({ onResetPassword, onLock }) {
  const { mode, colors, accent } = useTheme();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [previewItem, setPreviewItem] = useState(null);
  const [menuItem, setMenuItem] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const selectionMode = selected.size > 0;
  const bottomAnim = useRef(new Animated.Value(0)).current;
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef(null);
  const [recentSearches, setRecentSearches] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const val = await getSetting('recent_searches');
        if (val) {
          setRecentSearches(JSON.parse(val));
        }
      } catch (e) { console.error('load recent searches failed:', e.message); }
    })();
  }, []);

  const saveSearchQuery = async (q) => {
    if (!q || !q.trim()) return;
    const cleanQ = q.trim();
    let list = [cleanQ, ...recentSearches.filter(s => s !== cleanQ)];
    if (list.length > 5) list = list.slice(0, 5);
    setRecentSearches(list);
    await setSetting('recent_searches', JSON.stringify(list)).catch(() => { });
  };

  const removeSearchQuery = async (q) => {
    const list = recentSearches.filter(s => s !== q);
    setRecentSearches(list);
    await setSetting('recent_searches', JSON.stringify(list)).catch(() => { });
  };

  useEffect(() => {
    FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true }).catch(() => { });
  }, []);

  useEffect(() => {
    Animated.spring(bottomAnim, { toValue: selectionMode ? 1 : 0, useNativeDriver: true }).start();
  }, [selectionMode]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectionMode) { setSelected(new Set()); return true; }
      if (previewItem) { setPreviewItem(null); return true; }
      if (menuItem) { setMenuItem(null); return true; }
      if (query || searchFocused) {
        onSearch('');
        searchInputRef.current?.blur();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [selectionMode, previewItem, menuItem, query, searchFocused]);

  const refresh = useCallback(async (q = query, cat = category, isFocused = searchFocused, onlyFavs = showOnlyFavorites) => {
    try {
      if (q || isFocused) {
        if (!q) {
          setItems([]);
          return;
        }
        const all = await getItems('');
        let matched = all.filter(item => {
          const nameMatch = fuzzyMatch(item.name, q);
          const tagsMatch = item.tags ? fuzzyMatch(item.tags, q) : false;
          return nameMatch || tagsMatch;
        });
        if (onlyFavs) {
          matched = matched.filter(i => i.is_favorite === 1);
        }
        const filtered = cat && cat !== 'all' ? matched.filter(i => getCategory(i) === cat) : matched;
        setItems(filtered);
      } else {
        let all = await getItems('');
        if (onlyFavs) {
          all = all.filter(i => i.is_favorite === 1);
        }
        const filtered = cat && cat !== 'all' ? all.filter(i => getCategory(i) === cat) : all;
        setItems(filtered);
      }
    } catch (e) { console.error('refresh failed:', e.message); }
  }, [query, category, searchFocused, showOnlyFavorites]);

  const onSearch = (text) => { setQuery(text); };
  const onCategory = (key) => { setCategory(key); };

  useEffect(() => {
    refresh();
  }, [query, category, searchFocused, showOnlyFavorites]);
  const sections = useMemo(() => {
    const grouped = groupByMonth(items);
    if (viewMode === 'list') return grouped;
    return grouped.map(group => ({
      ...group,
      data: chunkByThree(group.data)
    }));
  }, [items, viewMode]);

  const saveFile = async (uri, ext, type) => {
    try {
      await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true }).catch(() => { });

      let finalUri = uri;
      let finalExt = ext;

      // Step 3: Compress image/scan immediately if it is from camera or library picker
      if (type === 'scan' || type === 'image') {
        try {
          const manipResult = await ImageManipulator.manipulateAsync(
            uri,
            [], // Keep same dimensions, just compress
            { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
          );
          finalUri = manipResult.uri;
          finalExt = 'jpg';
        } catch (manipError) {
          console.warn('Image manipulation/compression failed, using raw file:', manipError.message);
        }
      }

      // Step 2: Hash the file (Only if file size is reasonably small to avoid OOM)
      let fileContent = '';
      let hash = '';
      let size = 0;
      try {
        const info = await FileSystem.getInfoAsync(finalUri);
        size = info.size || 0;
      } catch { }

      if (size === 0 || size < 50 * 1024 * 1024) { // Only hash files under 50MB (or if size is reported as 0 due to content scheme)
        try {
          // Retry reading file string to handle transient access issues
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              fileContent = await FileSystem.readAsStringAsync(finalUri, { encoding: FileSystem.EncodingType.Base64 });
              hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, fileContent);
              break;
            } catch (readErr) {
              if (attempt === 3) throw readErr;
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        } catch (hashError) {
          console.warn('Hashing failed:', hashError.message);
        }
      }

      // Step 2: Check for duplicates
      let dest = '';
      let duplicateExists = false;
      if (hash) {
        const existingUri = await getLocalUriByHash(hash);
        if (existingUri) {
          dest = existingUri;
          duplicateExists = true;
        }
      }

      if (!duplicateExists) {
        // Copy/move the file if it doesn't exist
        const filename = `${Date.now()}.${finalExt}`;
        dest = VAULT_DIR + filename;
        let success = false;
        let lastError = null;

        // Try up to 3 times to copy or write the file to handle transient filesystem issues
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await FileSystem.copyAsync({ from: finalUri, to: dest });
            success = true;
            break;
          } catch (copyErr) {
            lastError = copyErr;
            if (fileContent) {
              try {
                await FileSystem.writeAsStringAsync(dest, fileContent, { encoding: FileSystem.EncodingType.Base64 });
                success = true;
                break;
              } catch (writeErr) {
                lastError = writeErr;
              }
            }
          }
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        if (!success) {
          console.error('File copy/write failed after 3 attempts:', lastError?.message || lastError);
          Alert.alert('Error', 'Something went wrong. Please try again.');
          return;
        }
      }

      try { const info = await FileSystem.getInfoAsync(dest); size = info.size || 0; } catch { }
      setPendingFile({ path: dest, type, size, ext: finalExt, hash, isDuplicate: duplicateExists });
      pickerActive.value = false;
    } catch (err) {
      console.error('Import failed:', err.message || err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  const pickImage = async () => {
    try {
      setShowAddMenu(false);
      pickerActive.value = true;
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!res.canceled) await saveFile(res.assets[0].uri, 'jpg', 'image');
    } catch (e) {
      console.error('Pick image failed:', e.message || e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setTimeout(() => {
        pickerActive.value = false;
      }, 1000);
    }
  };

  const pickDocument = async () => {
    try {
      setShowAddMenu(false);
      pickerActive.value = true;
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!res.canceled) {
        const ext = res.assets[0].name.split('.').pop().toLowerCase();
        const type = IMAGE_EXTS.includes(ext) ? 'image' : VIDEO_EXTS.includes(ext) ? 'video' : 'document';
        await saveFile(res.assets[0].uri, ext, type);
      }
    } catch (e) {
      console.error('Pick document failed:', e.message || e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setTimeout(() => {
        pickerActive.value = false;
      }, 1000);
    }
  };

  const confirmName = async () => {
    if (!nameInput.trim() || !pendingFile) return;
    try {
      await addItem(nameInput.trim(), pendingFile.type, pendingFile.path, nameInput.trim(), pendingFile.size, pendingFile.hash);
      setNameInput(''); setPendingFile(null); refresh(query, category);
    } catch (e) {
      console.error('Save item failed:', e.message || e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  const cancelPending = async () => {
    if (pendingFile?.path && !pendingFile.isDuplicate) {
      await FileSystem.deleteAsync(pendingFile.path, { idempotent: true }).catch(() => { });
    }
    setPendingFile(null); setNameInput('');
  };

  const openItem = async (item) => {
    const ext = getExt(item);
    const mime = MIME_TYPES[ext] || '*/*';
    try {
      pickerActive.value = true;
      const contentUri = await FileSystem.getContentUriAsync(item.file_path);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri, flags: 1, type: mime
      });
      pickerActive.value = false;
    } catch {
      pickerActive.value = false;
      Alert.alert('No app found', 'No app can open this file type.');
    }
  };

  const onItemPress = (item) => {
    if (selectionMode) { toggleSelect(item.id); return; }
    if (query.trim()) {
      saveSearchQuery(query);
    }
    const ext = getExt(item);
    const isImage = item.type === 'image' || item.type === 'scan' || IMAGE_EXTS.includes(ext);
    if (isImage) setPreviewItem(item);
    else openItem(item);
  };

  const onItemLongPress = (item) => {
    const next = new Set(selected);
    next.add(item.id);
    setSelected(next);
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const doDelete = async (itemsToDelete) => {
    Alert.alert('Delete', `Delete ${itemsToDelete.length} item${itemsToDelete.length > 1 ? 's' : ''}?`, [
      { text: 'Cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            for (const item of itemsToDelete) await deleteItem(item.id);
            setSelected(new Set()); refresh(query, category);
          } catch (e) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  const doShare = async (itemsToShare) => {
    try {
      pickerActive.value = true;
      for (const item of itemsToShare) {
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(item.file_path);
      }
      setSelected(new Set());
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setTimeout(() => {
        pickerActive.value = false;
      }, 1000);
    }
  };

  const doDuplicate = async (item) => {
    try {
      await addItem(`${item.name} (copy)`, item.type, item.local_uri || item.file_path, item.tags, item.size, item.file_hash);
      refresh(query, category);
      ToastAndroid.show('Duplicate created', ToastAndroid.SHORT);
    } catch (e) { Alert.alert('Error', 'Could not duplicate: ' + e.message); }
  };

  const startRename = (item) => {
    setMenuItem(null);
    setRenameInput(item.name);
    setRenameTarget(item);
  };

  const confirmRename = async () => {
    if (!renameInput.trim()) return;
    try {
      await renameItem(renameTarget.id, renameInput.trim());
      setRenameTarget(null); setRenameInput(''); refresh(query, category);
    } catch (e) { Alert.alert('Error', 'Could not rename: ' + e.message); }
  };

  const doToggleFavoriteMultiple = async (selectedItems) => {
    try {
      const anyNotFavorite = selectedItems.some(i => i.is_favorite !== 1);
      const targetVal = anyNotFavorite ? 1 : 0;
      for (const item of selectedItems) {
        await toggleFavorite(item.id, targetVal === 1 ? 0 : 1);
      }
      setSelected(new Set());
      refresh(query, category);
      ToastAndroid.show(anyNotFavorite ? 'Added to Favorites' : 'Removed from Favorites', ToastAndroid.SHORT);
    } catch (e) {
      Alert.alert('Error', 'Could not update favorites: ' + e.message);
    }
  };

  const selectedItems = items.filter(i => selected.has(i.id));
  const bottomTranslate = bottomAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] });

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
        {searchFocused || query ? (
          <TouchableOpacity
            onPress={() => {
              onSearch('');
              setSearchFocused(false);
              searchInputRef.current?.blur();
            }}
            style={[styles.headerBtn, { backgroundColor: colors.iconBg }]}
          >
            <Ionicons name="arrow-back-outline" size={18} color={accent} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setShowSettings(true)} style={[styles.headerBtn, { backgroundColor: colors.iconBg }]}>
            <Ionicons name="settings-outline" size={18} color={accent} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 12, height: 40 }}>
          <Ionicons name="search" size={16} color={colors.subtext} />
          <TextInput
            ref={searchInputRef}
            placeholder="Search files..."
            placeholderTextColor={colors.subtext}
            value={query}
            onChangeText={onSearch}
            onFocus={() => { setSearchFocused(true); setShowAddMenu(false); }}
            onBlur={() => setSearchFocused(false)}
            onSubmitEditing={() => {
              if (query.trim()) saveSearchQuery(query);
            }}
            returnKeyType="search"
            style={{ flex: 1, fontSize: 14, color: colors.text }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { onSearch(''); }}>
              <Ionicons name="close-circle" size={16} color={colors.subtext} />
            </TouchableOpacity>
          )}
        </View>
        {!(searchFocused || query) && (
          <TouchableOpacity onPress={() => setViewMode(v => v === 'list' ? 'grid' : 'list')} style={[styles.headerBtn, { backgroundColor: colors.iconBg }]}>
            <Ionicons name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={18} color={accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category tabs */}
      {!(searchFocused || query) && (
        <View style={{ backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}
          >
            {CATEGORIES.map(cat => {
              const active = category === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => onCategory(cat.key)}
                  style={[
                    styles.tabPill,
                    {
                      backgroundColor: active ? (mode === 'dark' ? '#000' : '#fff') : colors.bg,
                      borderColor: active ? accent : colors.border,
                      borderWidth: 1.5
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color: active ? accent : colors.subtext,
                        fontWeight: active ? '700' : '500'
                      }
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Selection header */}
      {selectionMode && (
        <View style={[styles.selectionHeader, { backgroundColor: accent }]}>
          <TouchableOpacity onPress={() => setSelected(new Set())} style={{ padding: 6 }}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{selected.size} selected</Text>
          <TouchableOpacity onPress={() => {
            const all = new Set(items.map(i => i.id));
            setSelected(selected.size === items.length ? new Set() : all);
          }}>
            <Text style={{ color: '#fff', fontSize: 13 }}>
              {selected.size === items.length ? 'Deselect all' : 'Select all'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* File list */}
      {((searchFocused || query) && !query && recentSearches.length > 0) ? (
        <ScrollView contentContainerStyle={styles.recentSearchesContainer} keyboardShouldPersistTaps="handled">
          <Text style={[styles.recentSearchesHeader, { color: colors.subtext }]}>RECENT SEARCHES</Text>
          {recentSearches.map((item, idx) => (
            <View key={idx} style={[styles.recentSearchRow, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                style={styles.recentSearchClickable}
                onPress={() => {
                  onSearch(item);
                  saveSearchQuery(item);
                }}
              >
                <Ionicons name="time-outline" size={18} color={colors.subtext} style={{ marginRight: 10 }} />
                <Text style={[styles.recentSearchText, { color: colors.text }]}>{item}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeSearchQuery(item)} style={styles.recentSearchRemove}>
                <Ionicons name="close-outline" size={18} color={colors.subtext} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.iconBg }]}>
            <Ionicons name={searchFocused || query ? "search-outline" : (showOnlyFavorites ? "star-outline" : "folder-open-outline")} size={40} color={accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {searchFocused || query ? "No results found" : getEmptyStateContent(showOnlyFavorites ? 'favorites' : category).title}
          </Text>
          <Text style={[styles.emptyText, { color: colors.subtext }]}>
            {searchFocused || query ? "Try typing a different name or tag" : getEmptyStateContent(showOnlyFavorites ? 'favorites' : category).text}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => viewMode === 'list' ? String(item.id) : String(item[0]?.id || index)}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 14 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section: { title } }) => (
            <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.subtext }]}>{title}</Text>
            </View>
          )}
          renderItem={({ item }) => viewMode === 'list' ? (
            <ListCard
              item={item}
              selected={selected.has(item.id)}
              selectionMode={selectionMode}
              onPress={() => onItemPress(item)}
              onLongPress={() => onItemLongPress(item)}
              onMenu={() => setMenuItem(item)}
              accent={accent}
              colors={colors}
            />
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-start' }}>
              {item.map(subItem => (
                <GridCard
                  key={subItem.id}
                  item={subItem}
                  selected={selected.has(subItem.id)}
                  selectionMode={selectionMode}
                  onPress={() => onItemPress(subItem)}
                  onLongPress={() => onItemLongPress(subItem)}
                  accent={accent}
                  colors={colors}
                />
              ))}
            </View>
          )}
        />
      )}

      {/* Bottom-left Favorites Star button */}
      {!selectionMode && !(searchFocused || query) && (
        <TouchableOpacity
          disabled={showAddMenu}
          onPress={() => setShowOnlyFavorites(prev => !prev)}
          style={[
            styles.favFab,
            {
              backgroundColor: showOnlyFavorites ? (mode === 'dark' ? '#000' : '#fff') : colors.cardBg,
              borderColor: accent,
              borderWidth: 1.5,
              zIndex: showAddMenu ? 0 : 997,
              elevation: showAddMenu ? 0 : 6
            }
          ]}
          activeOpacity={0.85}
        >
          <View style={styles.fabGloss} />
          <Ionicons
            name={showOnlyFavorites ? "star" : "star-outline"}
            size={24}
            color={accent}
          />
        </TouchableOpacity>
      )}

      {/* Add menu Speed Dial */}
      {showAddMenu && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 998, elevation: 20 }]}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            activeOpacity={1}
            onPress={() => setShowAddMenu(false)}
          />

          {/* Option 1: Pick Image (Top) */}
          <TouchableOpacity
            onPress={() => { setShowAddMenu(false); pickImage(); }}
            style={[styles.speedDialBtn, { position: 'absolute', bottom: 118, right: 27, backgroundColor: colors.cardBg, borderColor: accent, elevation: 21 }]}
          >
            <Ionicons name="image-outline" size={22} color={accent} />
          </TouchableOpacity>

          {/* Option 2: Pick File (Diagonal) */}
          <TouchableOpacity
            onPress={() => { setShowAddMenu(false); pickDocument(); }}
            style={[styles.speedDialBtn, { position: 'absolute', bottom: 93, right: 87, backgroundColor: colors.cardBg, borderColor: accent, elevation: 21 }]}
          >
            <Ionicons name="document-attach-outline" size={22} color={accent} />
          </TouchableOpacity>

          {/* Option 3: Camera Scan (Left) */}
          <TouchableOpacity
            onPress={() => { setShowAddMenu(false); setShowCamera(true); }}
            style={[styles.speedDialBtn, { position: 'absolute', bottom: 33, right: 112, backgroundColor: colors.cardBg, borderColor: accent, elevation: 21 }]}
          >
            <Ionicons name="camera-outline" size={22} color={accent} />
          </TouchableOpacity>
        </View>
      )}

      {/* FAB */}
      {!selectionMode && !(searchFocused || query) && (
        <TouchableOpacity
          onPress={() => setShowAddMenu(prev => !prev)}
          style={[
            styles.fab,
            {
              backgroundColor: showAddMenu ? (mode === 'dark' ? '#000' : '#fff') : colors.cardBg,
              borderColor: accent,
              borderWidth: 1.5,
              zIndex: 999,
              elevation: showAddMenu ? 22 : 6
            }
          ]}
          activeOpacity={0.85}
        >
          <View style={styles.fabGloss} />
          <Ionicons
            name={showAddMenu ? "close" : "add"}
            size={showAddMenu ? 26 : 28}
            color={accent}
          />
        </TouchableOpacity>
      )}

      {/* Bottom selection bar */}
      <Animated.View style={[styles.selectionBar, { backgroundColor: colors.cardBg, borderTopColor: colors.border, transform: [{ translateY: bottomTranslate }] }]}>
        {selectionMode && (
          <>
            <BarAction icon="share-social-outline" label="Share" onPress={() => doShare(selectedItems)} colors={colors} accent={accent} />
            <BarAction
              icon={selectedItems.some(i => i.is_favorite !== 1) ? "star" : "star-outline"}
              label={selectedItems.some(i => i.is_favorite !== 1) ? "Favorite" : "Unfavorite"}
              onPress={() => doToggleFavoriteMultiple(selectedItems)}
              colors={colors}
              accent={accent}
            />
            <BarAction icon="copy-outline" label="Duplicate" onPress={async () => { for (const it of selectedItems) await doDuplicate(it); setSelected(new Set()); }} colors={colors} accent={accent} />
            <BarAction icon="trash-outline" label="Delete" onPress={() => doDelete(selectedItems)} colors={colors} accent="#e11d48" />
          </>
        )}
      </Animated.View>

      {/* Camera */}
      <Modal visible={showCamera} animationType="slide">
        <CameraScreen
          onCapture={(uri) => { setShowCamera(false); saveFile(uri, 'jpg', 'scan'); }}
          onClose={() => { setShowCamera(false); }}
        />
      </Modal>

      {/* Name prompt with preview */}
      <Modal visible={!!pendingFile} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.overlay, { backgroundColor: colors.overlay, justifyContent: 'center' }]}>
          <View style={[styles.dialog, { backgroundColor: colors.cardBg }]}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              {pendingFile && <FileThumb item={{ file_path: pendingFile.path, type: pendingFile.type, file_hash: pendingFile.hash }} size={72} />}
            </View>
            <Text style={[styles.dialogTitle, { color: colors.text }]}>Name this file</Text>
            <Text style={[styles.dialogSub, { color: colors.subtext }]}>
              {pendingFile?.ext?.toUpperCase()} • {formatSize(pendingFile?.size)}
            </Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              placeholder="e.g. Aadhar card"
              placeholderTextColor={colors.subtext}
              style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={cancelPending} style={[styles.dialogBtn, { backgroundColor: colors.bg }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmName} style={[styles.dialogBtn, { backgroundColor: accent }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Image preview fullscreen */}
      <Modal visible={!!previewItem} animationType="fade" onRequestClose={() => setPreviewItem(null)}>
        <View style={styles.previewWrap}>
          <TouchableOpacity onPress={() => setPreviewItem(null)} style={styles.previewClose}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {previewItem && <Image source={{ uri: previewItem.file_path }} style={styles.previewImage} />}
          <View style={styles.previewInfo}>
            <Text style={styles.previewName}>{previewItem?.name}</Text>
            <Text style={styles.previewSub}>{formatSize(previewItem?.size)} • {timeAgo(previewItem?.created_at)}</Text>
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity onPress={() => previewItem && doShare([previewItem])} style={[styles.previewBtn, { backgroundColor: '#444' }]}>
              <Ionicons name="share-social-outline" size={18} color="#fff" />
              <Text style={styles.previewBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { const it = previewItem; setPreviewItem(null); doDelete([it]); }} style={[styles.previewBtn, { backgroundColor: '#b91c1c' }]}>
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.previewBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3-dot context menu */}
      <Modal visible={!!menuItem} transparent animationType="fade" onRequestClose={() => setMenuItem(null)}>
        <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay, justifyContent: 'flex-end' }]} activeOpacity={1} onPress={() => setMenuItem(null)}>
          <View style={[styles.sheet, { backgroundColor: colors.sheetBg }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            {menuItem && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, paddingHorizontal: 4 }}>
                <FileThumb item={menuItem} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>{menuItem.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.subtext }}>{formatSize(menuItem.size)} • {getFileTypeLabel(menuItem)}</Text>
                </View>
              </View>
            )}
            <MenuAction icon="open-outline" label="Open with" onPress={() => { const it = menuItem; setMenuItem(null); openItem(it); }} colors={colors} accent={accent} />
            <MenuAction icon="share-social-outline" label="Share" onPress={() => { const it = menuItem; setMenuItem(null); doShare([it]); }} colors={colors} accent={accent} />
            <MenuAction icon={menuItem?.is_favorite === 1 ? "star" : "star-outline"} label={menuItem?.is_favorite === 1 ? "Remove from Favorites" : "Add to Favorites"} onPress={() => { const it = menuItem; setMenuItem(null); toggleFavorite(it.id, it.is_favorite).then(() => refresh(query, category)).catch(() => Alert.alert("Error", "Failed to update favorite status")); }} colors={colors} accent={accent} />
            <MenuAction icon="copy-outline" label="Duplicate" onPress={() => { const it = menuItem; setMenuItem(null); doDuplicate(it); }} colors={colors} accent={accent} />
            <MenuAction icon="pencil-outline" label="Rename" onPress={() => startRename(menuItem)} colors={colors} accent={accent} />
            <MenuAction icon="information-circle-outline" label="Details" onPress={() => { setDetailItem(menuItem); setMenuItem(null); }} colors={colors} accent={accent} />
            <MenuAction icon="trash-outline" label="Delete" onPress={() => { const it = menuItem; setMenuItem(null); doDelete([it]); }} colors={colors} accent="#e11d48" danger />
            <TouchableOpacity onPress={() => setMenuItem(null)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename dialog */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.overlay, { backgroundColor: colors.overlay, justifyContent: 'center' }]}>
          <View style={[styles.dialog, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.dialogTitle, { color: colors.text }]}>Rename</Text>
            <TextInput
              value={renameInput}
              onChangeText={setRenameInput}
              autoFocus
              placeholder="File name"
              placeholderTextColor={colors.subtext}
              style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={() => setRenameTarget(null)} style={[styles.dialogBtn, { backgroundColor: colors.bg }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmRename} style={[styles.dialogBtn, { backgroundColor: accent }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Details dialog */}
      <Modal visible={!!detailItem} transparent animationType="fade" onRequestClose={() => setDetailItem(null)}>
        <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay, justifyContent: 'center' }]} activeOpacity={1} onPress={() => setDetailItem(null)}>
          <View style={[styles.dialog, { backgroundColor: colors.cardBg }]}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              {detailItem && <FileThumb item={detailItem} size={56} />}
            </View>
            <Text style={[styles.dialogTitle, { color: colors.text, textAlign: 'center' }]}>{detailItem?.name}</Text>
            <View style={[styles.detailsBox, { backgroundColor: colors.bg, borderColor: colors.border, marginTop: 12 }]}>
              <DetailRow label="Type" value={detailItem ? getFileTypeLabel(detailItem) : ''} colors={colors} />
              <DetailRow label="Size" value={formatSize(detailItem?.size)} colors={colors} />
              <DetailRow label="Added" value={detailItem ? new Date(detailItem.created_at).toLocaleString() : ''} colors={colors} />
              <DetailRow label="Path" value={detailItem?.file_path} colors={colors} />
            </View>
            <TouchableOpacity onPress={() => setDetailItem(null)} style={[styles.dialogBtn, { backgroundColor: accent, marginTop: 14 }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <SettingsScreen
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onImportDone={() => refresh(query, category)}
        onClearSearchHistory={() => setRecentSearches([])}
        onResetPassword={() => {
          setShowSettings(false);
          onResetPassword && onResetPassword();
        }}
        onLock={() => {
          setShowSettings(false);
          onLock && onLock();
        }}
      />
    </View>
  );
}


function SheetItem({ icon, label, sub, onPress, colors, accent }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.sheetItem}>
      <View style={[styles.sheetIconWrap, { backgroundColor: colors.iconBg }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sheetItemText, { color: colors.text }]}>{label}</Text>
        {sub && <Text style={[styles.sheetItemSub, { color: colors.subtext }]}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
    </TouchableOpacity>
  );
}

function MenuAction({ icon, label, onPress, colors, accent, danger }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.sheetItem, { paddingVertical: 12 }]}>
      <Ionicons name={icon} size={20} color={danger ? '#e11d48' : accent} style={{ width: 30 }} />
      <Text style={[styles.sheetItemText, { color: danger ? '#e11d48' : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function BarAction({ icon, label, onPress, colors, accent }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
      <Ionicons name={icon} size={22} color={accent} />
      <Text style={{ color: colors.text, fontSize: 11, marginTop: 3 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function DetailRow({ label, value, colors }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.subtext, fontSize: 12, width: 55 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 12, flex: 1 }} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 50, paddingBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { fontSize: 13 },
  selectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, marginBottom: 4, marginTop: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  listCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginBottom: 8, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  listCardName: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  listCardMeta: { fontSize: 11 },
  gridCard: { width: '31.3%', margin: '1%', overflow: 'hidden', padding: 8, alignItems: 'center' },
  gridCardCheck: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  gridCardName: { fontSize: 12, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  gridCardMeta: { fontSize: 10, marginTop: 2, marginBottom: 4 },
  fab: { position: 'absolute', bottom: 32, right: 26, width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)' },
  favFab: { position: 'absolute', bottom: 32, left: 26, width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, borderWidth: 1 },
  fabGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  speedDialBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  selectionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', borderTopWidth: 1, paddingBottom: 16, paddingTop: 4 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  sheetIconWrap: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  sheetItemText: { fontSize: 15, fontWeight: '500', flex: 1 },
  sheetItemSub: { fontSize: 12, marginTop: 1 },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: 15, color: '#ff3b30', fontWeight: '600' },
  dialog: { borderRadius: 24, padding: 24, width: '88%', alignSelf: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  dialogTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  dialogSub: { fontSize: 13, marginBottom: 16 },
  dialogInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginTop: 4, marginBottom: 16 },
  dialogBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  detailsBox: { borderRadius: 14, borderWidth: 1, padding: 14 },
  previewWrap: { flex: 1, backgroundColor: '#0d0d0f', justifyContent: 'center', alignItems: 'center' },
  previewClose: { position: 'absolute', top: 48, right: 20, zIndex: 1, padding: 8 },
  previewImage: { width: '100%', height: '75%', resizeMode: 'contain' },
  previewInfo: { position: 'absolute', bottom: 100, alignItems: 'center', paddingHorizontal: 20 },
  previewName: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  previewSub: { color: '#aaa', fontSize: 12, marginTop: 4 },
  previewActions: { position: 'absolute', bottom: 36, flexDirection: 'row', gap: 12 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30 },
  previewBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  recentSearchesContainer: { padding: 20 },
  recentSearchesHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12 },
  recentSearchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  recentSearchClickable: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  recentSearchText: { fontSize: 15, fontWeight: '500' },
  recentSearchRemove: { padding: 4, marginLeft: 10 },
});