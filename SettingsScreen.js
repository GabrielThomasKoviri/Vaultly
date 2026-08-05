import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { unzip, zip } from 'react-native-zip-archive';
import { useTheme } from './ThemeContext';
import Alert from './customAlert';
import { getSetting, setSetting } from './db';
import { pickerActive } from './pickerState';

// Components
import { ColorPickerArea, HueSlider, PICKER_WIDTH } from './components/ColorPicker';

// Utilities
import { hexToHsv, hsvToHex } from './utils/colorUtils';

async function secureHash(pin, salt) {
  let hashed = pin + salt;
  for (let i = 0; i < 5000; i++) {
    hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hashed);
  }
  return hashed;
}

function generateSalt() {
  try {
    return Array.from(Crypto.getRandomBytes(16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    let result = '';
    const chars = 'abcdef0123456789';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

async function hash(text) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

const PRESET_QUESTIONS = [
  "What is your father's name?",
  "What is the name of your first pet?",
  "What city were you born in?",
  "What was the name of your first school?"
];

const EXPORT_ZIP = FileSystem.cacheDirectory + 'vault_export.zip';

export default function SettingsScreen({ visible, onClose, onImportDone, onClearSearchHistory, onResetPassword, onLock }) {
  const { colors, accent, mode, toggleMode, accentKey, setAccent, ACCENTS, customColor, setCustom } = useTheme();
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwMode, setPwMode] = useState('export');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [importUri, setImportUri] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(customColor || accent || '#5b6cf0'));
  const [hexInput, setHexInput] = useState('');
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [changePinError, setChangePinError] = useState('');

  // Reset Security Question States
  const [showResetQuestionModal, setShowResetQuestionModal] = useState(false);
  const [resetQuestionVerifyMode, setResetQuestionVerifyMode] = useState(true);
  const [verifyPin, setVerifyPin] = useState('');
  const [verifyAnswer, setVerifyAnswer] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [currentSecurityQuestion, setCurrentSecurityQuestion] = useState('');
  const [newSelectedQuestion, setNewSelectedQuestion] = useState('');
  const [newCustomQuestion, setNewCustomQuestion] = useState('');
  const [newRecoveryAnswer, setNewRecoveryAnswer] = useState('');
  const [newQuestionError, setNewQuestionError] = useState('');
  const [showQuestionDropdown, setShowQuestionDropdown] = useState(false);

  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricSupported(compatible && enrolled);

        const enabled = await AsyncStorage.getItem('biometrics_enabled');
        setBiometricsEnabled(enabled === 'true');
      } catch (err) {
        console.error('Failed to load biometric support info:', err);
      }
    })();
  }, [visible]);

  const toggleBiometrics = async () => {
    const nextVal = !biometricsEnabled;
    setBiometricsEnabled(nextVal);
    try {
      await AsyncStorage.setItem('biometrics_enabled', nextVal ? 'true' : 'false');
    } catch (e) {
      console.error('Failed to save biometric setting:', e);
    }
  };

  const startExport = () => {
    setPwMode('export');
    setPassword('');
    setConfirmPw('');
    setShowPwModal(true);
  };

  const startImport = async () => {
    try {
      pickerActive.value = true;
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/zip', copyToCacheDirectory: true });
      pickerActive.value = false;
      if (res.canceled) {
        return;
      }
      setImportUri(res.assets[0].uri);
      setPwMode('import');
      setPassword('');
      setShowPwModal(true);
    } catch (e) {
      pickerActive.value = false;
      Alert.alert('Error', 'Could not pick file: ' + e.message);
    }
  };

  const runExport = async () => {
    if (password.length < 4) { Alert.alert('Weak password', 'Use at least 4 characters.'); return; }
    if (password !== confirmPw) { Alert.alert('Mismatch', 'Passwords do not match.'); return; }
    setBusy(true);
    try {
      // Copy database file if it exists so it's included in documentDirectory zipping
      const dbDir = FileSystem.documentDirectory + '../SQLite/';
      const dbFile = dbDir + 'vault.db';
      const dbTemp = FileSystem.documentDirectory + 'vault.db';
      
      let dbCopied = false;
      const dbInfo = await FileSystem.getInfoAsync(dbFile);
      if (dbInfo.exists) {
        await FileSystem.copyAsync({ from: dbFile, to: dbTemp });
        dbCopied = true;
      } else {
        const dbInfoAlt = await FileSystem.getInfoAsync(FileSystem.documentDirectory + 'SQLite/vault.db');
        if (dbInfoAlt.exists) {
          await FileSystem.copyAsync({ from: FileSystem.documentDirectory + 'SQLite/vault.db', to: dbTemp });
          dbCopied = true;
        }
      }

      // Ensure the old export file in cache is deleted first
      await FileSystem.deleteAsync(EXPORT_ZIP, { idempotent: true }).catch(() => {});
      
      await zip(FileSystem.documentDirectory, EXPORT_ZIP, undefined, password);
      
      // Clean up the temp database copy
      if (dbCopied) {
        await FileSystem.deleteAsync(dbTemp, { idempotent: true }).catch(() => {});
      }

      setShowPwModal(false);
      setBusy(false);
      
      pickerActive.value = true;
      await Sharing.shareAsync(EXPORT_ZIP);
    } catch (e) {
      setBusy(false);
      Alert.alert('Export failed', e.message || String(e));
    } finally {
      setTimeout(() => {
        pickerActive.value = false;
      }, 1000);
    }
  };

  const runImport = async () => {
    if (!password) { Alert.alert('Password required', 'Enter the password used during export.'); return; }
    setBusy(true);
    try {
      await unzip(importUri, FileSystem.documentDirectory, undefined, password);
      
      // Check if vault.db was restored in temp path
      const dbTemp = FileSystem.documentDirectory + 'vault.db';
      const dbTempInfo = await FileSystem.getInfoAsync(dbTemp);
      if (dbTempInfo.exists) {
        const dbDir = FileSystem.documentDirectory + '../SQLite/';
        await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true }).catch(() => {});
        await FileSystem.copyAsync({ from: dbTemp, to: dbDir + 'vault.db' });
        
        // Also copy to alt path just in case
        const dbDirAlt = FileSystem.documentDirectory + 'SQLite/';
        await FileSystem.makeDirectoryAsync(dbDirAlt, { intermediates: true }).catch(() => {});
        await FileSystem.copyAsync({ from: dbTemp, to: dbDirAlt + 'vault.db' }).catch(() => {});

        // Delete the temp database file
        await FileSystem.deleteAsync(dbTemp, { idempotent: true }).catch(() => {});
      }

      setShowPwModal(false);
      setBusy(false);
      Alert.alert('Import complete', 'Restart the app to see imported items.', [
        { text: 'OK', onPress: () => { onImportDone && onImportDone(); onClose(); } }
      ]);
    } catch (e) {
      setBusy(false);
      Alert.alert('Import failed', 'Wrong password or invalid file.\n' + (e.message || ''));
    } finally {
      pickerActive.value = false;
    }
  };

  const handleChangePin = async () => {
    if (oldPin.length < 4) { setChangePinError('Old PIN must be at least 4 digits.'); return; }
    if (newPin.length < 4) { setChangePinError('New PIN must be at least 4 digits.'); return; }
    if (newPin !== confirmNewPin) { setChangePinError('New PINs do not match.'); return; }

    try {
      const storedHash = await getSetting('pin_hash');
      const storedSalt = await getSetting('pin_salt');

      let isCorrect = false;
      if (storedSalt) {
        const enteredHash = await secureHash(oldPin, storedSalt);
        isCorrect = (enteredHash === storedHash);
      } else {
        const enteredHash = await hash(oldPin);
        isCorrect = (enteredHash === storedHash);
      }

      if (!isCorrect) {
        setChangePinError('Incorrect old PIN.');
        return;
      }

      Alert.alert(
        'Confirm PIN Change',
        'Are you sure you want to change your unlock PIN?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              try {
                const newSalt = generateSalt();
                const newSecureHash = await secureHash(newPin, newSalt);
                await setSetting('pin_salt', newSalt);
                await setSetting('pin_hash', newSecureHash);

                await setSetting('failed_pin_attempts', '0');
                await setSetting('pin_lockout_until', '');

                Alert.alert(
                  'Success',
                  'PIN changed successfully. You will now be redirected to the login screen.',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        setShowChangePinModal(false);
                        setOldPin('');
                        setNewPin('');
                        setConfirmNewPin('');
                        setChangePinError('');
                        onLock && onLock();
                      }
                    }
                  ]
                );
              } catch (e) {
                setChangePinError('Could not change PIN: ' + e.message);
              }
            }
          }
        ]
      );
    } catch (e) {
      setChangePinError('Could not change PIN: ' + e.message);
    }
  };

  const handleForgotPin = () => {
    setShowChangePinModal(false);
    onClose();
    onResetPassword();
  };

  const openResetQuestionModal = async () => {
    try {
      const question = await getSetting('recovery_question');
      const hasQuestion = Boolean(question && question.trim());
      setCurrentSecurityQuestion(hasQuestion ? question : 'No security question set.');
      setResetQuestionVerifyMode(hasQuestion);
      setVerifyPin('');
      setVerifyAnswer('');
      setVerifyError('');
      setNewSelectedQuestion('');
      setNewCustomQuestion('');
      setNewRecoveryAnswer('');
      setNewQuestionError('');
      setShowQuestionDropdown(false);
      setShowResetQuestionModal(true);
    } catch (e) {
      Alert.alert('Error', 'Could not load current security question.');
    }
  };

  const handleVerifyForResetQuestion = async () => {
    if (!verifyAnswer) {
      setVerifyError('Please enter the answer to the security question.');
      return;
    }

    try {
      const storedAnswerHash = await getSetting('recovery_answer_hash');
      const sanitizedAnswer = verifyAnswer.trim().toLowerCase();
      const enteredAnswerHash = await hash(sanitizedAnswer);

      if (enteredAnswerHash === storedAnswerHash) {
        setResetQuestionVerifyMode(false);
        setVerifyError('');
      } else {
        setVerifyError('Incorrect answer to the security question.');
      }
    } catch (e) {
      setVerifyError('Verification failed: ' + e.message);
    }
  };

  const handleSaveNewQuestion = async () => {
    const questionText = newSelectedQuestion === 'custom' ? newCustomQuestion.trim() : newSelectedQuestion;
    const answerText = newRecoveryAnswer.trim();

    if (!questionText) {
      setNewQuestionError('Please select or write a security question.');
      return;
    }
    if (!answerText) {
      setNewQuestionError('Please provide an answer.');
      return;
    }

    Alert.alert(
      'Confirm Security Question Update',
      'Are you sure you want to update your security question? You will be redirected to the login screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const sanitizedAnswer = answerText.toLowerCase();
              const answerHash = await hash(sanitizedAnswer);

              await setSetting('recovery_question', questionText);
              await setSetting('recovery_answer_hash', answerHash);

              await setSetting('failed_recovery_attempts', '0');
              await setSetting('recovery_lockout_until', '');

              Alert.alert(
                'Success',
                'Security question updated successfully. You will now be redirected to the login screen.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setShowResetQuestionModal(false);
                      onLock && onLock();
                    }
                  }
                ]
              );
            } catch (e) {
              setNewQuestionError('Could not save security question: ' + e.message);
            }
          }
        }
      ]
    );
  };

  const clearCache = () => {
    Alert.alert(
      'Clear Cache',
      'Are you sure you want to clear the temporary cache? This will delete cached thumbnails and temporary files.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const cacheDir = FileSystem.cacheDirectory;
              const files = await FileSystem.readDirectoryAsync(cacheDir);
              for (const file of files) {
                await FileSystem.deleteAsync(cacheDir + file, { idempotent: true }).catch(() => {});
              }
              Alert.alert('Cache Cleared', 'All temporary files and cached thumbnails have been cleared.');
            } catch (e) {
              console.error('Error clearing cache:', e);
              Alert.alert('Error', 'Failed to clear cache.');
            }
          }
        }
      ]
    );
  };

  const clearSearchHistory = () => {
    Alert.alert(
      'Clear Search History',
      'Are you sure you want to delete your search history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await setSetting('recent_searches', JSON.stringify([]));
              onClearSearchHistory && onClearSearchHistory();
              Alert.alert('History Cleared', 'Your search history has been deleted.');
            } catch (e) {
              console.error('Error clearing search history:', e);
              Alert.alert('Error', 'Failed to clear search history.');
            }
          }
        }
      ]
    );
  };

  const handleContactSupport = async () => {
    const email = 'dev.gabrielthomas@gmail.com';
    const subject = encodeURIComponent('[Vaultly App] Support & Feedback');
    const body = encodeURIComponent(
      'Hi Gabriel,\n\nI am writing regarding the Vaultly app.\n\n[Write your message or feedback here]\n\n---\nSent from Vaultly App'
    );
    const mailUrl = `mailto:${email}?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(mailUrl);
      if (canOpen) {
        await Linking.openURL(mailUrl);
      } else {
        Alert.alert(
          'Contact & Support',
          'Could not automatically open email app. Please send your email directly to:\n\ndev.gabrielthomas@gmail.com'
        );
      }
    } catch (e) {
      Alert.alert(
        'Contact & Support',
        'Could not open email app. Please send your email directly to:\n\ndev.gabrielthomas@gmail.com'
      );
    }
  };

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);

  const openColorPicker = () => {
    const initial = hexToHsv(customColor || accent || '#5b6cf0');
    setHsv(initial);
    setHexInput(hsvToHex(initial.h, initial.s, initial.v).toUpperCase());
    setShowColorPicker(true);
  };

  const updateSV = (s, v) => setHsv(prev => {
    const next = { ...prev, s, v };
    setHexInput(hsvToHex(next.h, next.s, next.v).toUpperCase());
    return next;
  });

  const updateHue = (h) => setHsv(prev => {
    const next = { ...prev, h };
    setHexInput(hsvToHex(next.h, next.s, next.v).toUpperCase());
    return next;
  });

  const onHexInputChange = (text) => {
    setHexInput(text);
    const cleaned = text.startsWith('#') ? text : '#' + text;
    if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
      setHsv(hexToHsv(cleaned));
    }
  };

  const applyCustomColor = async () => {
    try {
      let finalHex = currentHex;
      const cleaned = hexInput.startsWith('#') ? hexInput : '#' + hexInput;
      if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) finalHex = cleaned;
      await setCustom(finalHex.toLowerCase());
      setShowColorPicker(false);
    } catch (e) {
      Alert.alert('Error', 'Could not save color: ' + e.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheetContainer, { backgroundColor: colors.sheetBg }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={[styles.sectionTitle, { color: colors.subtext }]}>APPEARANCE</Text>
            <TouchableOpacity onPress={toggleMode} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={20} color={accent} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Dark mode</Text>
              </View>
              <View style={[styles.switchBg, { backgroundColor: mode === 'dark' ? accent : '#d1d1d6' }]}>
                <View style={[styles.switchThumb, { alignSelf: mode === 'dark' ? 'flex-end' : 'flex-start' }]} />
              </View>
            </TouchableOpacity>

            <View style={[styles.colorPickerCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.colorPickerTitle, { color: colors.text }]}>Accent color</Text>
              <View style={styles.colorPickerRow}>
                {Object.entries(ACCENTS).map(([key, color]) => (
                  <TouchableOpacity key={key} onPress={() => setAccent(key)} style={[
                    styles.accentCircle, { backgroundColor: color, borderWidth: accentKey === key ? 3 : 0, borderColor: colors.text }
                  ]}>
                    {accentKey === key && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </TouchableOpacity>
                ))}
                {accentKey === 'custom' && customColor && (
                  <View style={[
                    styles.accentCircle, { backgroundColor: customColor, borderWidth: 3, borderColor: colors.text }
                  ]}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  </View>
                )}
                <TouchableOpacity onPress={openColorPicker} style={[
                  styles.addAccentCircle, { borderColor: colors.border, backgroundColor: colors.bg }
                ]}>
                  <Ionicons name="add" size={20} color={colors.subtext} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.subtext }]}>SECURITY</Text>
            <TouchableOpacity onPress={() => { setShowChangePinModal(true); setOldPin(''); setNewPin(''); setConfirmNewPin(''); setChangePinError(''); }} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Ionicons name="key-outline" size={20} color={accent} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Change PIN</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Update your current vault unlock PIN</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
            </TouchableOpacity>

            <TouchableOpacity onPress={openResetQuestionModal} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border, marginTop: 12 }]}>
              <Ionicons name="help-circle-outline" size={20} color={accent} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Reset Security Question</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Update your recovery security question & answer</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
            </TouchableOpacity>

            {isBiometricSupported && (
              <TouchableOpacity onPress={toggleBiometrics} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border, marginTop: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <Ionicons name="finger-print-outline" size={20} color={accent} />
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Biometric unlock</Text>
                </View>
                <View style={[styles.switchBg, { backgroundColor: biometricsEnabled ? accent : '#d1d1d6' }]}>
                  <View style={[styles.switchThumb, { alignSelf: biometricsEnabled ? 'flex-end' : 'flex-start' }]} />
                </View>
              </TouchableOpacity>
            )}

            <Text style={[styles.sectionTitle, { color: colors.subtext }]}>BACKUP & STORAGE</Text>
            <TouchableOpacity onPress={startExport} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Ionicons name="cloud-upload-outline" size={20} color={accent} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Export vault</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Create a password-protected backup</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
            </TouchableOpacity>

            <TouchableOpacity onPress={startImport} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Ionicons name="cloud-download-outline" size={20} color={accent} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Import vault</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Restore from a backup file</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
            </TouchableOpacity>

            <TouchableOpacity onPress={clearCache} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Ionicons name="trash-outline" size={20} color="#ff3b30" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Clear temporary cache</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Delete cached thumbnails and temporary files</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
            </TouchableOpacity>

            <TouchableOpacity onPress={clearSearchHistory} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={20} color="#ff9500" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Clear search history</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Delete recent search records</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { color: colors.subtext, marginTop: 12 }]}>SUPPORT & HELP</Text>
            <TouchableOpacity onPress={handleContactSupport} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Ionicons name="mail-outline" size={20} color={accent} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>Contact & Support</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Reach out to developer via email</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
            </TouchableOpacity>

            <View style={{ marginTop: 20, alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>Vaultly • Offline secure storage</Text>
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Password modal */}
      <Modal visible={showPwModal} transparent animationType="fade">
        <View style={[styles.dialogOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.dialogTitle, { color: colors.text }]}>
              {pwMode === 'export' ? 'Set a backup password' : 'Enter backup password'}
            </Text>
            <Text style={[styles.dialogSub, { color: colors.subtext }]}>
              {pwMode === 'export' ? "You'll need this password to restore the backup." : 'Enter the password used when this backup was created.'}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.subtext}
              style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, marginBottom: pwMode === 'export' ? 10 : 0 }]}
            />
            {pwMode === 'export' && (
              <TextInput
                value={confirmPw}
                onChangeText={setConfirmPw}
                secureTextEntry
                placeholder="Confirm password"
                placeholderTextColor={colors.subtext}
                style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
              />
            )}
            <View style={styles.dialogButtons}>
              <TouchableOpacity onPress={() => setShowPwModal(false)} disabled={busy} style={[styles.dialogBtn, { backgroundColor: colors.bg }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pwMode === 'export' ? runExport : runImport} disabled={busy} style={[styles.dialogBtn, { backgroundColor: accent }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>{pwMode === 'export' ? 'Export' : 'Import'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Busy / Progress overlay modal */}
      <Modal visible={busy} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <View style={[styles.dialog, { backgroundColor: colors.cardBg, alignItems: 'center', borderWidth: 1, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={accent} style={{ marginBottom: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8, textAlign: 'center' }}>
              {pwMode === 'export' ? 'Exporting Vault...' : 'Importing Vault...'}
            </Text>
            <Text style={{ fontSize: 14, color: colors.subtext, textAlign: 'center', lineHeight: 20, marginBottom: 4 }}>
              Processing and encrypting files chunk-by-chunk to save memory.
            </Text>
            <Text style={{ fontSize: 12, color: accent, fontWeight: '600', textAlign: 'center', marginTop: 10 }}>
              ⚠️ Please keep the app open and your screen awake.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Custom color picker */}
      <Modal visible={showColorPicker} transparent animationType="fade">
        <View style={[styles.dialogOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: colors.cardBg, alignItems: 'center' }]}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 14, alignSelf: 'flex-start' }}>Pick a color</Text>

            <ColorPickerArea hue={hsv.h} sat={hsv.s} val={hsv.v} onChangeSV={updateSV} />
            <HueSlider hue={hsv.h} onChangeHue={updateHue} />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, width: PICKER_WIDTH, gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: currentHex, borderWidth: 1, borderColor: colors.border }} />
              <TextInput
                value={hexInput}
                onChangeText={onHexInputChange}
                autoCapitalize="characters"
                maxLength={7}
                placeholder="#RRGGBB"
                placeholderTextColor={colors.subtext}
                style={{ flex: 1, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, borderRadius: 8, padding: 10, fontSize: 14 }}
              />
            </View>

            <View style={styles.dialogButtons}>
              <TouchableOpacity onPress={() => setShowColorPicker(false)} style={[styles.dialogBtn, { backgroundColor: colors.bg }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={applyCustomColor} style={[styles.dialogBtn, { backgroundColor: currentHex }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Select</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change PIN Modal */}
      <Modal visible={showChangePinModal} transparent animationType="fade">
        <View style={[styles.dialogOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.dialogTitle, { color: colors.text }]}>Change PIN</Text>
            <Text style={[styles.dialogSub, { color: colors.subtext }]}>
              Enter your current PIN and choose a new one.
            </Text>

            <TextInput
              value={oldPin}
              onChangeText={(t) => { setOldPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setChangePinError(''); }}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="Current PIN"
              placeholderTextColor={colors.subtext}
              style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, marginBottom: 10 }]}
            />

            <TextInput
              value={newPin}
              onChangeText={(t) => { setNewPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setChangePinError(''); }}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="New PIN (4-6 digits)"
              placeholderTextColor={colors.subtext}
              style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, marginBottom: 10 }]}
            />

            <TextInput
              value={confirmNewPin}
              onChangeText={(t) => { setConfirmNewPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setChangePinError(''); }}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="Confirm new PIN"
              placeholderTextColor={colors.subtext}
              style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
            />

            <TouchableOpacity onPress={handleForgotPin} style={{ marginTop: 12, alignSelf: 'flex-end', paddingHorizontal: 4 }}>
              <Text style={{ color: accent, fontSize: 13, fontWeight: '600' }}>Forgot PIN?</Text>
            </TouchableOpacity>

            {changePinError ? (
              <Text style={{ color: '#ff4444', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{changePinError}</Text>
            ) : null}

            <View style={styles.dialogButtons}>
              <TouchableOpacity onPress={() => setShowChangePinModal(false)} style={[styles.dialogBtn, { backgroundColor: colors.bg }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleChangePin} style={[styles.dialogBtn, { backgroundColor: accent }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Security Question Modal */}
      <Modal visible={showResetQuestionModal} transparent animationType="fade">
        <View style={[styles.dialogOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.dialogTitle, { color: colors.text }]}>Reset Security Question</Text>
            
            {resetQuestionVerifyMode ? (
              <View style={{ width: '100%' }}>
                <Text style={[styles.dialogSub, { color: colors.subtext, marginBottom: 12 }]}>
                  Verify your identity by answering your current security question.
                </Text>
                
                <View style={{ backgroundColor: colors.bg, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: colors.subtext, fontWeight: '600', marginBottom: 2 }}>Current Question:</Text>
                  <Text style={{ fontSize: 14, color: colors.text, fontWeight: '500', lineHeight: 18 }}>{currentSecurityQuestion}</Text>
                </View>

                <TextInput
                  value={verifyAnswer}
                  onChangeText={(t) => { setVerifyAnswer(t); setVerifyError(''); }}
                  placeholder="Answer current question"
                  placeholderTextColor={colors.subtext}
                  autoCapitalize="none"
                  style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
                />

                {verifyError ? (
                  <Text style={{ color: '#ff4444', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{verifyError}</Text>
                ) : null}

                <View style={styles.dialogButtons}>
                  <TouchableOpacity onPress={() => setShowResetQuestionModal(false)} style={[styles.dialogBtn, { backgroundColor: colors.bg }]}>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleVerifyForResetQuestion} style={[styles.dialogBtn, { backgroundColor: accent }]}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Verify</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 400, width: '100%' }} contentContainerStyle={{ paddingVertical: 4 }} showsVerticalScrollIndicator={false}>
                <Text style={[styles.dialogSub, { color: colors.subtext, marginBottom: 12 }]}>
                  {currentSecurityQuestion === 'No security question set.'
                    ? 'No security question is set yet. Set a new one and provide an answer below.'
                    : 'Select a new security question and provide an answer to recover access if you forget your PIN.'}                </Text>
                <View style={{ width: '100%', marginBottom: 12, zIndex: 10 }}>
                  <TouchableOpacity
                    onPress={() => setShowQuestionDropdown(!showQuestionDropdown)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 14,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      backgroundColor: colors.cardBg,
                    }}
                  >
                    <Text style={{ color: newSelectedQuestion ? colors.text : colors.subtext, fontSize: 14, flex: 1 }}>
                      {newSelectedQuestion === 'custom'
                        ? 'Write a custom security question...'
                        : (newSelectedQuestion || 'Select a security question...')}
                    </Text>
                    <Ionicons name={showQuestionDropdown ? "chevron-up" : "chevron-down"} size={18} color={colors.subtext} />
                  </TouchableOpacity>

                  {showQuestionDropdown && (
                    <View style={{
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      borderRadius: 12,
                      backgroundColor: colors.cardBg,
                      overflow: 'hidden',
                      marginTop: 6,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.1,
                      shadowRadius: 8,
                      elevation: 4
                    }}>
                      {PRESET_QUESTIONS.map((q) => (
                        <TouchableOpacity
                          key={q}
                          onPress={() => {
                            setNewSelectedQuestion(q);
                            setShowQuestionDropdown(false);
                            setNewQuestionError('');
                          }}
                          style={{
                            padding: 14,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                            backgroundColor: newSelectedQuestion === q ? colors.iconBg : 'transparent'
                          }}
                        >
                          <Text style={{ color: colors.text, fontSize: 14 }}>{q}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        onPress={() => {
                          setNewSelectedQuestion('custom');
                          setShowQuestionDropdown(false);
                          setNewQuestionError('');
                        }}
                        style={{
                          padding: 14,
                          backgroundColor: newSelectedQuestion === 'custom' ? colors.iconBg : 'transparent'
                        }}
                      >
                        <Text style={{ color: colors.text, fontSize: 14 }}>Write a custom security question...</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {newSelectedQuestion === 'custom' && (
                  <TextInput
                    value={newCustomQuestion}
                    onChangeText={(t) => { setNewCustomQuestion(t); setNewQuestionError(''); }}
                    placeholder="Enter custom question"
                    placeholderTextColor={colors.subtext}
                    style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, marginBottom: 12, fontSize: 14 }]}
                  />
                )}

                <TextInput
                  value={newRecoveryAnswer}
                  onChangeText={(t) => { setNewRecoveryAnswer(t); setNewQuestionError(''); }}
                  placeholder="New answer"
                  placeholderTextColor={colors.subtext}
                  autoCapitalize="none"
                  style={[styles.dialogInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, fontSize: 14 }]}
                />

                {newQuestionError ? (
                  <Text style={{ color: '#ff4444', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{newQuestionError}</Text>
                ) : null}

                <View style={styles.dialogButtons}>
                  <TouchableOpacity onPress={() => setShowResetQuestionModal(false)} style={[styles.dialogBtn, { backgroundColor: colors.bg }]}>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveNewQuestion} style={[styles.dialogBtn, { backgroundColor: accent }]}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetContainer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  colorPickerCard: { borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1 },
  colorPickerTitle: { fontSize: 15, fontWeight: '500', marginBottom: 12 },
  colorPickerRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  accentCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  addAccentCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  switchBg: { width: 46, height: 26, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 3 },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  dialogOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dialog: { borderRadius: 24, padding: 24, width: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  dialogTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  dialogSub: { fontSize: 13, marginBottom: 16 },
  dialogInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15 },
  dialogButtons: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  dialogBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
});