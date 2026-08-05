import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import Alert from './customAlert';
import { useShareIntent } from 'expo-share-intent';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { addItem, getSetting, setSetting } from './db';
import * as Crypto from 'expo-crypto';
import { useTheme } from './ThemeContext';

const VAULT_DIR = FileSystem.documentDirectory + 'vault/';

async function hash(text) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

export default function ShareHandler() {
  const { colors, accent } = useTheme();
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent();
  const [pending, setPending] = useState(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const timerRef = useRef(null);

  const checkLockout = async () => {
    try {
      const lockoutUntilStr = await getSetting('pin_lockout_until');
      if (lockoutUntilStr) {
        const lockoutTime = new Date(lockoutUntilStr).getTime();
        const now = Date.now();
        if (lockoutTime > now) {
          const diffSeconds = Math.ceil((lockoutTime - now) / 1000);
          setLockoutSeconds(diffSeconds);
          startLockoutTimer(diffSeconds);
          setPinError(`Too many failed attempts. Try again in ${diffSeconds} seconds.`);
          return true;
        }
      }
    } catch (e) {
      console.error('Check lockout error:', e);
    }
    return false;
  };

  const startLockoutTimer = (seconds) => {
    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = seconds;
    timerRef.current = setInterval(async () => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setLockoutSeconds(0);
        setPinError('');
        await setSetting('pin_lockout_until', '');
      } else {
        setLockoutSeconds(remaining);
        setPinError(`Too many failed attempts. Try again in ${remaining} seconds.`);
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (showPinModal) {
      checkLockout();
    }
  }, [showPinModal]);

  useEffect(() => {
    if (error) console.error('ShareIntent error:', error);
  }, [error]);

  useEffect(() => {
    if (hasShareIntent && shareIntent?.files?.length > 0) {
      const file = shareIntent.files[0];
      setPending({
        fileName: file.fileName || file.path?.split('/').pop() || 'shared_file',
        contentUri: file.path,
        filePath: file.path,
      });
      setPinVerified(false);
      setPin('');
      setPinError('');
      setShowPinModal(true);
    } else if (hasShareIntent && shareIntent?.text) {
      // Text shared — save as .txt
      setPending({
        fileName: 'shared_text.txt',
        contentUri: null,
        filePath: null,
        text: shareIntent.text,
      });
      setPinVerified(false);
      setPin('');
      setPinError('');
      setShowPinModal(true);
    }
  }, [hasShareIntent, shareIntent]);

  const [pinVerified, setPinVerified] = useState(false);

  const verifyPin = async () => {
    try {
      const isLocked = await checkLockout();
      if (isLocked) return;

      const storedHash = await getSetting('pin_hash');
      if (!storedHash) {
        setPinVerified(true);
        setShowPinModal(false);
        setNameInput(pending?.fileName || 'Shared file');
        setShowNameModal(true);
        return;
      }

      const storedSalt = await getSetting('pin_salt');
      let isCorrect = false;

      if (storedSalt) {
        let hashed = pin + storedSalt;
        for (let i = 0; i < 5000; i++) {
          hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hashed);
        }
        isCorrect = (hashed === storedHash);
      } else {
        const enteredHash = await hash(pin);
        isCorrect = (enteredHash === storedHash);
        
        if (isCorrect) {
          try {
            const newSalt = Array.from(Crypto.getRandomBytes(16)).map(b => b.toString(16).padStart(2, '0')).join('');
            let newSecureHash = pin + newSalt;
            for (let i = 0; i < 5000; i++) {
              newSecureHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, newSecureHash);
            }
            await setSetting('pin_salt', newSalt);
            await setSetting('pin_hash', newSecureHash);
          } catch (migrateErr) {
            console.error('Migration failed:', migrateErr);
          }
        }
      }

      if (isCorrect) {
        await setSetting('failed_pin_attempts', '0');
        await setSetting('pin_lockout_until', '');
        setLockoutSeconds(0);
        if (timerRef.current) clearInterval(timerRef.current);

        setPinVerified(true);
        setShowPinModal(false);
        setNameInput(pending?.fileName || 'Shared file');
        setShowNameModal(true);
      } else {
        const attemptsStr = await getSetting('failed_pin_attempts');
        const attempts = (attemptsStr ? parseInt(attemptsStr, 10) : 0) + 1;
        await setSetting('failed_pin_attempts', String(attempts));

        let lockoutDuration = 0;
        if (attempts >= 10) {
          lockoutDuration = 15 * 60;
        } else if (attempts >= 5) {
          lockoutDuration = 2 * 60;
        } else if (attempts >= 3) {
          lockoutDuration = 30;
        }

        if (lockoutDuration > 0) {
          const lockoutUntil = new Date(Date.now() + lockoutDuration * 1000).toISOString();
          await setSetting('pin_lockout_until', lockoutUntil);
          setLockoutSeconds(lockoutDuration);
          startLockoutTimer(lockoutDuration);
          setPinError(`Too many failed attempts. Try again in ${lockoutDuration} seconds.`);
        } else {
          const remainingAttempts = 3 - attempts;
          if (remainingAttempts > 0) {
            setPinError(`Incorrect PIN. ${remainingAttempts} attempts left.`);
          } else {
            setPinError('Incorrect PIN. Try again.');
          }
        }
        setPin('');
      }
    } catch (e) {
      setPinError('Error: ' + e.message);
    }
  };

  const saveSharedFile = async () => {
    if (!nameInput.trim() || !pending) return;
    setSaving(true);
    try {
      await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true }).catch(() => {});
      let dest, size = 0, type = 'document';

      if (pending.text) {
        // Save text as .txt file
        dest = VAULT_DIR + `${Date.now()}.txt`;
        await FileSystem.writeAsStringAsync(dest, pending.text);
        size = pending.text.length;
        type = 'document';
      } else {
        const uri = pending.contentUri || pending.filePath;
        const ext = (pending.fileName || 'file').split('.').pop().toLowerCase();
        dest = VAULT_DIR + `${Date.now()}.${ext}`;
        
        let success = false;
        let lastError = null;

        // Try up to 3 times to copy or write the file to handle transient filesystem issues
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await FileSystem.copyAsync({ from: uri, to: dest });
            success = true;
            break;
          } catch (copyErr) {
            lastError = copyErr;
            try {
              const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
              await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
              success = true;
              break;
            } catch (writeErr) {
              lastError = writeErr;
            }
          }
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        if (!success) {
          console.error('Share save file copy/write failed after 3 attempts:', lastError?.message || lastError);
          Alert.alert('Error', 'Something went wrong. Please try again.');
          setSaving(false);
          return;
        }

        try { const info = await FileSystem.getInfoAsync(dest); size = info.size || 0; } catch {}
        const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
        const isVideo = ['mp4','mkv','mov','avi'].includes(ext);
        type = isImage ? 'image' : isVideo ? 'video' : 'document';
      }

      await addItem(nameInput.trim(), type, dest, nameInput.trim(), size);
      setSaving(false);
      setShowNameModal(false);
      setPending(null);
      resetShareIntent();
      Alert.alert('Saved!', `"${nameInput.trim()}" has been added to your vault.`);
    } catch (e) {
      setSaving(false);
      console.error('Share save failed:', e.message || e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  const dismiss = () => {
    setShowPinModal(false);
    setShowNameModal(false);
    setPending(null);
    setPin('');
    setPinError('');
    try { resetShareIntent(); } catch {}
  };

  if (!pending) return null;

  return (
    <>
      <Modal visible={showPinModal} transparent animationType="fade" onRequestClose={dismiss}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.overlay }}>
          <View style={{ backgroundColor: colors.cardBg, borderRadius: 16, padding: 22, width: '85%', alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.iconBg, justifyContent: 'center', alignItems: 'center', marginBottom: 14 }}>
              <Ionicons name="shield-checkmark-outline" size={26} color={accent} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Save to My Vault</Text>
            <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 16, textAlign: 'center' }}>
              Enter your PIN to save{'\n'}"{pending?.fileName || 'this file'}" to vault
            </Text>
            <TextInput
              value={pin}
              onChangeText={(t) => { setPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setPinError(''); }}
              keyboardType="number-pad"
              secureTextEntry
              autoFocus
              placeholder="••••"
              editable={lockoutSeconds === 0}
              placeholderTextColor={colors.subtext}
              style={{ borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, borderRadius: 10, padding: 12, fontSize: 18, width: 140, textAlign: 'center', letterSpacing: 8, marginBottom: 8, opacity: lockoutSeconds > 0 ? 0.5 : 1 }}
              onSubmitEditing={verifyPin}
            />
            {pinError ? <Text style={{ color: '#e11d48', fontSize: 12, marginBottom: 8 }}>{pinError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 6 }}>
              <TouchableOpacity onPress={dismiss} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.bg }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={lockoutSeconds > 0}
                onPress={verifyPin}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: accent, opacity: lockoutSeconds > 0 ? 0.5 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showNameModal} transparent animationType="fade" onRequestClose={dismiss}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.overlay }}>
          <View style={{ backgroundColor: colors.cardBg, borderRadius: 16, padding: 22, width: '85%' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Name this file</Text>
            <Text style={{ fontSize: 12, color: colors.subtext, marginBottom: 14 }}>{pending?.fileName}</Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              placeholder="e.g. My document"
              placeholderTextColor={colors.subtext}
              style={{ borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 14 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={dismiss} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.bg }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveSharedFile} disabled={saving} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: accent }}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Save to Vault</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}