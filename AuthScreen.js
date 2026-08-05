import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Alert from './customAlert';
import { getSetting, setSetting } from './db';
import { useTheme } from './ThemeContext';

const PIN_HASH_ITERATIONS = 200;
const LEGACY_PIN_HASH_ITERATIONS = 5000;

async function secureHash(pin, salt, iterations = PIN_HASH_ITERATIONS) {
  let hashed = pin + salt;
  for (let i = 0; i < iterations; i++) {
    hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hashed);
  }
  return hashed;
}

async function secureHashLegacy(pin, salt) {
  return secureHash(pin, salt, LEGACY_PIN_HASH_ITERATIONS);
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

const WORDLIST = [
  'apple','river','stone','cloud','tiger','maple','ocean','spark','flame','grove',
  'eagle','coral','delta','frost','amber','quartz','silver','willow','canyon','meadow',
  'breeze','summit','harbor','jasper','lunar','orbit','pearl','rapid','sable','timber'
];

function generateMnemonic() {
  const words = [];
  for (let i = 0; i < 12; i++) {
    words.push(WORDLIST[Math.floor(Math.random() * WORDLIST.length)]);
  }
  return words.join(' ');
}

async function hash(text) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

export default function AuthScreen({ onUnlocked, initialMode, onCancel, onResetSuccess }) {
  const { mode: themeMode, colors, accent } = useTheme();
  const [mode, setMode] = useState('loading'); // loading | setup_intro | setup_recovery | setup_pin | unlock | forgot
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [enteredRecovery, setEnteredRecovery] = useState('');
  const [error, setError] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newConfirmPin, setNewConfirmPin] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dbQuestion, setDbQuestion] = useState('');
  const [enteredAnswer, setEnteredAnswer] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [recoveryLockoutSeconds, setRecoveryLockoutSeconds] = useState(0);
  const timerRef = useRef(null);
  const recoveryTimerRef = useRef(null);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricAvailable(compatible && enrolled);
      } catch (err) {
        console.error('Biometric status check failed:', err);
      }
    })();
  }, []);

  const triggerBiometricUnlock = async () => {
    try {
      const isLocked = await checkLockout();
      if (isLocked) return;

      const enabled = await AsyncStorage.getItem('biometrics_enabled');
      if (enabled !== 'true') return;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock your Vault',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: true,
      });

      if (result.success) {
        await resetLockout();
        setPin('');
        setError('');
        onUnlocked();
      }
    } catch (e) {
      console.error('Biometric auth failed:', e);
    }
  };

  const formatLockoutMessage = (sec, isRecovery = false) => {
    const prefix = isRecovery ? 'Too many failed recovery attempts' : 'Too many failed attempts';
    if (sec >= 60) {
      const min = Math.ceil(sec / 60);
      return `${prefix}. Try again in ${min} ${min === 1 ? 'minute' : 'minutes'}.`;
    }
    return `${prefix}. Try again in ${sec} ${sec === 1 ? 'second' : 'seconds'}.`;
  };

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
          setError(formatLockoutMessage(diffSeconds, false));
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
        setError('');
        await setSetting('pin_lockout_until', '');
      } else {
        setLockoutSeconds(remaining);
        setError(formatLockoutMessage(remaining, false));
      }
    }, 1000);
  };

  const checkRecoveryLockout = async () => {
    try {
      const lockoutUntilStr = await getSetting('recovery_lockout_until');
      if (lockoutUntilStr) {
        const lockoutTime = new Date(lockoutUntilStr).getTime();
        const now = Date.now();
        if (lockoutTime > now) {
          const diffSeconds = Math.ceil((lockoutTime - now) / 1000);
          setRecoveryLockoutSeconds(diffSeconds);
          startRecoveryLockoutTimer(diffSeconds);
          setError(formatLockoutMessage(diffSeconds, true));
          return true;
        }
      }
    } catch (e) {
      console.error('Check recovery lockout error:', e);
    }
    return false;
  };

  const startRecoveryLockoutTimer = (seconds) => {
    if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
    let remaining = seconds;
    recoveryTimerRef.current = setInterval(async () => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(recoveryTimerRef.current);
        setRecoveryLockoutSeconds(0);
        setError('');
        await setSetting('recovery_lockout_until', '');
      } else {
        setRecoveryLockoutSeconds(remaining);
        setError(formatLockoutMessage(remaining, true));
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const runFlow = async () => {
      if (mode === 'unlock') {
        const isLocked = await checkLockout();
        if (!cancelled && !isLocked) {
          await triggerBiometricUnlock();
        }
      } else if (mode === 'forgot') {
        await loadRecoveryQuestion();
        await checkRecoveryLockout();
      }
    };

    runFlow();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const handleFailedAttempt = async () => {
    try {
      const attemptsStr = await getSetting('failed_pin_attempts');
      const attempts = (attemptsStr ? parseInt(attemptsStr, 10) : 0) + 1;
      await setSetting('failed_pin_attempts', String(attempts));

      let lockoutDuration = 0;
      if (attempts >= 15) {
        lockoutDuration = 30 * 60; // 30 minutes
      } else if (attempts >= 10) {
        lockoutDuration = 5 * 60; // 5 minutes
      } else if (attempts >= 5) {
        lockoutDuration = 30; // 30 seconds
      }

      if (lockoutDuration > 0) {
        const lockoutUntil = new Date(Date.now() + lockoutDuration * 1000).toISOString();
        await setSetting('pin_lockout_until', lockoutUntil);
        setLockoutSeconds(lockoutDuration);
        startLockoutTimer(lockoutDuration);
        setError(formatLockoutMessage(lockoutDuration, false));
      } else {
        let remainingAttempts = 0;
        if (attempts < 5) {
          remainingAttempts = 5 - attempts;
        } else if (attempts < 10) {
          remainingAttempts = 10 - attempts;
        } else if (attempts < 15) {
          remainingAttempts = 15 - attempts;
        }
        if (remainingAttempts > 0) {
          setError(`Incorrect PIN. ${remainingAttempts} attempts left.`);
        } else {
          setError('Incorrect PIN. Try again.');
        }
      }
    } catch (e) {
      setError('Error handling failed attempt: ' + e.message);
    }
  };

  const handleFailedRecoveryAttempt = async () => {
    try {
      const attemptsStr = await getSetting('failed_recovery_attempts');
      const attempts = (attemptsStr ? parseInt(attemptsStr, 10) : 0) + 1;
      await setSetting('failed_recovery_attempts', String(attempts));

      let lockoutDuration = 0;
      if (attempts >= 15) {
        lockoutDuration = 30 * 60; // 30 minutes
      } else if (attempts >= 10) {
        lockoutDuration = 5 * 60; // 5 minutes
      } else if (attempts >= 5) {
        lockoutDuration = 30; // 30 seconds
      }

      if (lockoutDuration > 0) {
        const lockoutUntil = new Date(Date.now() + lockoutDuration * 1000).toISOString();
        await setSetting('recovery_lockout_until', lockoutUntil);
        setRecoveryLockoutSeconds(lockoutDuration);
        startRecoveryLockoutTimer(lockoutDuration);
        setError(formatLockoutMessage(lockoutDuration, true));
      } else {
        let remainingAttempts = 0;
        if (attempts < 5) {
          remainingAttempts = 5 - attempts;
        } else if (attempts < 10) {
          remainingAttempts = 10 - attempts;
        } else if (attempts < 15) {
          remainingAttempts = 15 - attempts;
        }
        if (remainingAttempts > 0) {
          setError(`Incorrect answer. ${remainingAttempts} attempts left.`);
        } else {
          setError('Incorrect answer. Try again.');
        }
      }
    } catch (e) {
      setError('Error handling failed recovery attempt: ' + e.message);
    }
  };

  const resetLockout = async () => {
    try {
      await setSetting('failed_pin_attempts', '0');
      await setSetting('pin_lockout_until', '');
      setLockoutSeconds(0);
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (e) {
      console.error('Reset lockout error:', e);
    }
  };

  const resetRecoveryLockout = async () => {
    try {
      await setSetting('failed_recovery_attempts', '0');
      await setSetting('recovery_lockout_until', '');
      setRecoveryLockoutSeconds(0);
      if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
    } catch (e) {
      console.error('Reset recovery lockout error:', e);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (initialMode) {
          setMode(initialMode);
          return;
        }
        const isSetup = await getSetting('pin_hash');
        if (isSetup) {
          // Pre-check lockout so we don't flash the PIN input screen
          const lockoutUntilStr = await getSetting('pin_lockout_until');
          if (lockoutUntilStr) {
            const lockoutTime = new Date(lockoutUntilStr).getTime();
            const now = Date.now();
            if (lockoutTime > now) {
              const diffSeconds = Math.ceil((lockoutTime - now) / 1000);
              setLockoutSeconds(diffSeconds);
              startLockoutTimer(diffSeconds);
              setError(formatLockoutMessage(diffSeconds, false));
            }
          }
          setMode('unlock');
        } else {
          setMode('setup_intro');
        }
      } catch (e) {
        console.error('Auth init error:', e.message);
        setMode('setup_intro');
      }
    })();
  }, [initialMode]);

  const loadRecoveryQuestion = async () => {
    try {
      const question = await getSetting('recovery_question');
      setDbQuestion(question || '');
    } catch (e) {
      console.error('Failed to load recovery question:', e);
      setDbQuestion('');
    }
  };

  const beginSetup = () => {
    setMode('setup_recovery');
  };

  const confirmSecurityQuestion = () => {
    const questionText = selectedQuestion === 'custom' ? customQuestion.trim() : selectedQuestion;
    if (!questionText) {
      setError('Please select or write a security question.');
      return;
    }
    if (!recoveryAnswer.trim()) {
      setError('Please provide an answer to the security question.');
      return;
    }
    setError('');
    setMode('setup_pin');
  };

  const finishSetup = async () => {
    if (pin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    if (pin !== confirmPin) { setError('PINs do not match.'); return; }
    
    Alert.alert(
      'Confirm Setup',
      'Are you sure you want to set this PIN and security question? Please ensure you remember them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const questionText = selectedQuestion === 'custom' ? customQuestion.trim() : selectedQuestion;
              const sanitizedAnswer = recoveryAnswer.trim().toLowerCase();

              const salt = generateSalt();
              const pinHash = await secureHash(pin, salt);
              const answerHash = await hash(sanitizedAnswer);

              await setSetting('pin_salt', salt);
              await setSetting('pin_hash', pinHash);
              await setSetting('pin_hash_version', 'v2');
              await setSetting('recovery_question', questionText);
              await setSetting('recovery_answer_hash', answerHash);
              setDbQuestion(questionText);

              await resetLockout();
              await resetRecoveryLockout();

              if (isBiometricAvailable) {
                try {
                  const bioResult = await LocalAuthentication.authenticateAsync({
                    promptMessage: 'Scan to enable Biometric Unlock',
                    fallbackLabel: 'Skip',
                    disableDeviceFallback: true,
                  });

                  if (bioResult.success) {
                    await AsyncStorage.setItem('biometrics_enabled', 'true');
                    Alert.alert(
                      'Biometrics Enabled',
                      'Biometric unlock has been successfully enabled for your vault.',
                      [
                        {
                          text: 'OK',
                          onPress: () => onUnlocked()
                        }
                      ]
                    );
                  } else {
                    await AsyncStorage.setItem('biometrics_enabled', 'false');
                    onUnlocked();
                  }
                } catch (bioErr) {
                  console.error('Biometric setup trigger failed:', bioErr);
                  await AsyncStorage.setItem('biometrics_enabled', 'false');
                  onUnlocked();
                }
              } else {
                onUnlocked();
              }
            } catch (e) {
              setError('Could not save PIN: ' + e.message);
            }
          }
        }
      ]
    );
  };

  const tryUnlock = async () => {
    try {
      const isLocked = await checkLockout();
      if (isLocked) return;

      const storedHash = await getSetting('pin_hash');
      const storedSalt = await getSetting('pin_salt');
      const storedVersion = await getSetting('pin_hash_version');

      let isCorrect = false;
      let shouldMigrateToV2 = false;

      if (storedSalt) {
        const enteredFastHash = await secureHash(pin, storedSalt);
        isCorrect = (enteredFastHash === storedHash);

        if (!isCorrect && storedVersion !== 'v2') {
          try {
            const enteredLegacyHash = await secureHashLegacy(pin, storedSalt);
            isCorrect = (enteredLegacyHash === storedHash);
            shouldMigrateToV2 = isCorrect;
          } catch (legacyErr) {
            console.error('Legacy PIN verify failed:', legacyErr);
          }
        }
      } else {
        try {
          const enteredHash = await hash(pin);
          isCorrect = (enteredHash === storedHash);

          if (isCorrect) {
            const newSalt = generateSalt();
            const newSecureHash = await secureHash(pin, newSalt);
            await setSetting('pin_salt', newSalt);
            await setSetting('pin_hash', newSecureHash);
            await setSetting('pin_hash_version', 'v2');
          }
        } catch (migrationErr) {
          console.error('PIN migration failed:', migrationErr);
        }
      }

      if (isCorrect) {
        if (shouldMigrateToV2) {
          try {
            const newSecureHash = await secureHash(pin, storedSalt);
            await setSetting('pin_hash', newSecureHash);
            await setSetting('pin_hash_version', 'v2');
          } catch (migrateErr) {
            console.error('PIN migration failed:', migrateErr);
          }
        }
        await resetLockout();
        setPin('');
        setError('');
        onUnlocked();
      } else {
        await handleFailedAttempt();
        setPin('');
      }
    } catch (e) {
      setError('Unlock error: ' + e.message);
    }
  };

  const tryRecovery = async () => {
    try {
      const isLocked = await checkRecoveryLockout();
      if (isLocked) return;

      const storedQuestion = await getSetting('recovery_question');
      const storedAnswerHash = await getSetting('recovery_answer_hash');

      if (!storedQuestion && !storedAnswerHash) {
        setDbQuestion('');
        setSelectedQuestion('');
        setCustomQuestion('');
        setRecoveryAnswer('');
        setError('');
        setMode('setup_recovery');
        return;
      }

      const answer = enteredAnswer.trim().toLowerCase();
      const enteredHash = await hash(answer);

      if (!storedAnswerHash) {
        const storedRecoveryHash = await getSetting('recovery_hash');
        if (storedRecoveryHash) {
          const oldEnteredHash = await hash(enteredAnswer.trim());
          if (oldEnteredHash === storedRecoveryHash) {
            await resetRecoveryLockout();
            setMode('reset_pin_after_recovery');
            return;
          }
        }
      }

      if (storedAnswerHash && enteredHash === storedAnswerHash) {
        await resetRecoveryLockout();
        setMode('reset_pin_after_recovery');
      } else {
        await handleFailedRecoveryAttempt();
      }
    } catch (e) {
      setError('Recovery error: ' + e.message);
    }
  };

  const resetPinAfterRecovery = async () => {
    if (newPin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    if (newPin !== newConfirmPin) { setError('PINs do not match.'); return; }
    try {
      const salt = generateSalt();
      const pinHash = await secureHash(newPin, salt);
      await setSetting('pin_salt', salt);
      await setSetting('pin_hash', pinHash);
      await setSetting('pin_hash_version', 'v2');
      await resetLockout();
      setNewPin(''); setNewConfirmPin(''); setEnteredAnswer(''); setEnteredRecovery(''); setError('');
      Alert.alert(
        'Success',
        'PIN has been reset successfully.',
        [
          {
            text: 'OK',
            onPress: () => {
              if (onResetSuccess) {
                onResetSuccess();
              }
              setMode('unlock');
              setError('');
              setPin('');
              setConfirmPin('');
              setNewPin('');
              setNewConfirmPin('');
              setEnteredRecovery('');
              setEnteredAnswer('');
            }
          }
        ]
      );
    } catch (e) {
      setError('Could not reset PIN: ' + e.message);
      Alert.alert('Error', 'Could not reset PIN: ' + e.message);
    }
  };

  const Keypad = ({ value, setValue, onSubmit }) => (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View key={i} style={{
            width: 14, height: 14, borderRadius: 7,
            backgroundColor: i < value.length ? accent : 'transparent',
            borderWidth: 1.5, borderColor: accent
          }} />
        ))}
      </View>
      <TextInput
        value={value}
        onChangeText={(t) => setValue(t.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        autoFocus
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
        onSubmitEditing={onSubmit}
      />
    </View>
  );

  if (mode === 'loading') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (mode === 'setup_intro') {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.iconBg }]}>
          <Ionicons name="shield-checkmark-outline" size={36} color={accent} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Secure your vault</Text>
        <Text style={[styles.sub, { color: colors.subtext }]}>
          Set up a PIN to protect your files. You'll also set up a security question to recover access if you forget your PIN.
        </Text>
        <TouchableOpacity onPress={beginSetup} style={[styles.btnPill, { borderColor: accent, backgroundColor: themeMode === 'dark' ? '#000' : '#fff' }]}>
          <Text style={[styles.btnText, { color: accent }]}>Get started</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === 'setup_recovery') {
    const presetQuestions = [
      "What is your father's name?",
      "What is the name of your first pet?",
      "What city were you born in?",
      "What was the name of your first school?"
    ];

    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[styles.container, { paddingTop: 60, paddingBottom: 40 }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.iconBg, width: 64, height: 64, borderRadius: 32 }]}>
          <Ionicons name="help-circle-outline" size={28} color={accent} />
        </View>
        <Text style={[styles.title, { color: colors.text, fontSize: 20 }]}>Security Recovery Question</Text>
        <Text style={[styles.sub, { color: colors.subtext, fontSize: 13, marginBottom: 20 }]}>
          Select a security question and answer it. If you forget your PIN, this question will be used to recover access.
        </Text>

        <View style={{ width: '100%', marginBottom: 16, zIndex: 10 }}>
          <Text style={{ color: colors.subtext, fontSize: 13, marginBottom: 6 }}>Security Question</Text>
          <TouchableOpacity
            onPress={() => setShowDropdown(!showDropdown)}
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
            <Text style={{ color: selectedQuestion ? colors.text : colors.subtext, fontSize: 14, flex: 1 }}>
              {selectedQuestion === 'custom'
                ? 'Write a custom security question...'
                : (selectedQuestion || 'Select a security question...')}
            </Text>
            <Ionicons name={showDropdown ? "chevron-up" : "chevron-down"} size={18} color={colors.subtext} />
          </TouchableOpacity>

          {showDropdown && (
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
              {presetQuestions.map((q) => (
                <TouchableOpacity
                  key={q}
                  onPress={() => {
                    setSelectedQuestion(q);
                    setShowDropdown(false);
                    setError('');
                  }}
                  style={{
                    padding: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: selectedQuestion === q ? colors.iconBg : 'transparent'
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 14 }}>{q}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => {
                  setSelectedQuestion('custom');
                  setShowDropdown(false);
                  setError('');
                }}
                style={{
                  padding: 14,
                  backgroundColor: selectedQuestion === 'custom' ? colors.iconBg : 'transparent'
                }}
              >
                <Text style={{ color: colors.text, fontSize: 14 }}>Write a custom security question...</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {selectedQuestion === 'custom' && (
          <View style={{ width: '100%', marginBottom: 16 }}>
            <Text style={{ color: colors.subtext, fontSize: 13, marginBottom: 6 }}>Custom Question</Text>
            <TextInput
              value={customQuestion}
              onChangeText={(t) => { setCustomQuestion(t); setError(''); }}
              placeholder="e.g. What is your favorite book?"
              placeholderTextColor={colors.subtext}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: colors.inputBorder,
                backgroundColor: colors.inputBg,
                color: colors.text,
                fontSize: 14
              }}
            />
          </View>
        )}

        <View style={{ width: '100%', marginBottom: 16 }}>
          <Text style={{ color: colors.subtext, fontSize: 13, marginBottom: 6 }}>Answer</Text>
          <TextInput
            value={recoveryAnswer}
            onChangeText={(t) => { setRecoveryAnswer(t); setError(''); }}
            placeholder="Your answer"
            placeholderTextColor={colors.subtext}
            autoCapitalize="none"
            style={{
              width: '100%',
              padding: 12,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: colors.inputBorder,
              backgroundColor: colors.inputBg,
              color: colors.text,
              fontSize: 14
            }}
          />
        </View>

        {error && <Text style={[styles.errorText, { marginBottom: 12 }]}>{error}</Text>}

        <View style={[styles.warningBox, { backgroundColor: colors.bg === '#121214' ? '#2c1e15' : '#fef3cd', marginBottom: 20 }]}>
          <Text style={[styles.warningText, { color: colors.bg === '#121214' ? '#ffb076' : '#92660c' }]}>
            ⚠️ Choose an answer only you know. The answer is case-insensitive.
          </Text>
        </View>

        <TouchableOpacity onPress={confirmSecurityQuestion} style={[styles.btnFull, { borderColor: accent, backgroundColor: themeMode === 'dark' ? '#000' : '#fff' }]}>
          <Text style={[styles.btnText, { color: accent }]}>Confirm Recovery Details</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (mode === 'setup_pin') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: 20 }]}>Create a PIN</Text>
        <Text style={[styles.sub, { color: colors.subtext, fontSize: 13, marginBottom: 24 }]}>Choose a 4-6 digit PIN to unlock your vault</Text>

        <Text style={[styles.pinInputLabel, { color: colors.subtext }]}>Enter PIN</Text>
        <TextInput
          value={pin}
          onChangeText={(t) => { setPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
          keyboardType="number-pad"
          secureTextEntry
          placeholder="••••"
          placeholderTextColor={colors.subtext}
          style={[styles.pinInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
        />
        <Text style={[styles.pinInputLabel, { color: colors.subtext }]}>Confirm PIN</Text>
        <TextInput
          value={confirmPin}
          onChangeText={(t) => { setConfirmPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
          keyboardType="number-pad"
          secureTextEntry
          placeholder="••••"
          placeholderTextColor={colors.subtext}
          style={[styles.pinInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity onPress={finishSetup} style={[styles.btnPill, { borderColor: accent, marginTop: 8, backgroundColor: themeMode === 'dark' ? '#000' : '#fff' }]}>
          <Text style={[styles.btnText, { color: accent }]}>Finish setup</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  if (mode === 'unlock') {
    const isLockedOut = lockoutSeconds > 0;

    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.iconBg }]}>
          <Ionicons name={isLockedOut ? "alert-circle-outline" : "lock-closed-outline"} size={34} color={accent} />
        </View>
        <Text style={[styles.title, { color: colors.text, marginBottom: 20 }]}>
          {isLockedOut ? "Vault Locked" : "Enter your PIN"}
        </Text>

        {isLockedOut ? (
          <View style={{ alignItems: 'center', width: '100%', paddingHorizontal: 10 }}>
            {error && <Text style={[styles.errorText, { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 }]}>{error}</Text>}
            <TouchableOpacity
              onPress={() => { setMode('forgot'); setError(''); setPin(''); }}
              style={[styles.btnFull, { borderColor: accent, backgroundColor: themeMode === 'dark' ? '#000' : '#fff', marginBottom: 16 }]}
            >
              <Text style={[styles.btnText, { color: accent }]}>Reset PIN via Security Question</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              value={pin}
              onChangeText={(t) => { setPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={colors.subtext}
              autoFocus
              style={[styles.pinInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
              onSubmitEditing={tryUnlock}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <View style={{ alignItems: 'center', marginBottom: 16, width: '100%' }}>
              <TouchableOpacity
                onPress={tryUnlock}
                style={[
                  styles.btnPill,
                  {
                    borderColor: accent,
                    backgroundColor: themeMode === 'dark' ? '#000' : '#fff',
                    width: 160,
                  }
                ]}
              >
                <Text style={[styles.btnText, { color: accent }]}>Unlock</Text>
              </TouchableOpacity>
            </View>
            {isBiometricAvailable && (
              <View style={{ position: 'absolute', bottom: 28, left: 0, right: 0, alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={triggerBiometricUnlock}
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    borderWidth: 1.5,
                    borderColor: accent,
                    backgroundColor: themeMode === 'dark' ? '#000' : '#fff',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Ionicons name="finger-print-outline" size={24} color={accent} />
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={() => { setMode('forgot'); setError(''); setPin(''); }}>
              <Text style={[styles.linkText, { color: colors.subtext }]}>Forgot PIN?</Text>
            </TouchableOpacity>
          </>
        )}
      </KeyboardAvoidingView>
    );
  }

  if (mode === 'forgot') {
    const isRecoveryLockedOut = recoveryLockoutSeconds > 0;
    const hasRecoveryQuestion = Boolean(dbQuestion && dbQuestion.trim());

    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.bg }]}>
        <TouchableOpacity
          onPress={() => {
            if (onCancel) {
              onCancel();
            } else {
              setMode('unlock');
              setError('');
              setEnteredAnswer('');
              setEnteredRecovery('');
            }
          }}
          style={{
            position: 'absolute',
            top: Platform.OS === 'ios' ? 60 : 40,
            left: 24,
            width: 50,
            height: 50,
            borderRadius: 25,
            borderWidth: 1.5,
            borderColor: accent,
            backgroundColor: themeMode === 'dark' ? '#000' : '#fff',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 4,
            zIndex: 10
          }}
        >
          <Ionicons name="close" size={24} color={accent} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text, marginTop: 40 }]}>Recover access</Text>
        <Text style={[styles.sub, { color: colors.subtext, fontSize: 13, marginBottom: 20 }]}>
          Answer your security question to reset your PIN.
        </Text>

        <View style={{ width: '100%', marginBottom: 16, paddingHorizontal: 10 }}>
          {hasRecoveryQuestion ? (
            <>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 12, textAlign: 'center', lineHeight: 22 }}>
                {dbQuestion}
              </Text>

              {!isRecoveryLockedOut && (
                <TextInput
                  value={enteredAnswer}
                  onChangeText={(t) => { setEnteredAnswer(t); setError(''); }}
                  placeholder="Your answer"
                  placeholderTextColor={colors.subtext}
                  autoCapitalize="none"
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: colors.inputBorder,
                    backgroundColor: colors.inputBg,
                    color: colors.text,
                    fontSize: 14
                  }}
                />
              )}
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={[styles.errorText, { marginBottom: 8, textAlign: 'center' }]}>You haven't set up a security question yet.</Text>
              <Text style={[styles.sub, { color: colors.subtext, fontSize: 13, textAlign: 'center', marginBottom: 16 }]}>Set a new one so you can recover your PIN later.</Text>
              <TouchableOpacity
                onPress={() => {
                  setError('');
                  setSelectedQuestion('');
                  setCustomQuestion('');
                  setRecoveryAnswer('');
                  setMode('setup_recovery');
                }}
                style={[styles.btnFull, { borderColor: accent, marginBottom: 12, backgroundColor: themeMode === 'dark' ? '#000' : '#fff' }]}
              >
                <Text style={[styles.btnText, { color: accent }]}>Set security question</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {error && !hasRecoveryQuestion && <Text style={[styles.errorText, { marginBottom: 16, paddingHorizontal: 10, textAlign: 'center' }]}>{error}</Text>}

        {!isRecoveryLockedOut && hasRecoveryQuestion && (
          <TouchableOpacity
            onPress={tryRecovery}
            style={[
              styles.btnFull,
              {
                borderColor: accent,
                marginBottom: 12,
                backgroundColor: themeMode === 'dark' ? '#000' : '#fff',
              }
            ]}
          >
            <Text style={[styles.btnText, { color: accent }]}>Verify</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => {
            if (onCancel) {
              onCancel();
            } else {
              setMode('unlock');
              setError('');
              setEnteredAnswer('');
              setEnteredRecovery('');
            }
          }}
        >
          <Text style={[styles.linkText, { color: colors.subtext }]}>
            {onCancel ? 'Cancel' : 'Back to PIN entry'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  if (mode === 'reset_pin_after_recovery') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.bg }]}>
        <TouchableOpacity
          onPress={() => {
            if (onCancel) {
              onCancel();
            } else {
              setMode('unlock');
              setError('');
              setPin('');
              setNewPin('');
              setNewConfirmPin('');
            }
          }}
          style={{
            position: 'absolute',
            top: Platform.OS === 'ios' ? 60 : 40,
            left: 24,
            width: 50,
            height: 50,
            borderRadius: 25,
            borderWidth: 1.5,
            borderColor: accent,
            backgroundColor: themeMode === 'dark' ? '#000' : '#fff',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 4,
            zIndex: 10
          }}
        >
          <Ionicons name="close" size={24} color={accent} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text }]}>Set a new PIN</Text>
        <Text style={[styles.sub, { color: colors.subtext, fontSize: 13, marginBottom: 24 }]}>Recovery verified. Choose a new PIN.</Text>
        <Text style={[styles.pinInputLabel, { color: colors.subtext }]}>New PIN</Text>
        <TextInput
          value={newPin}
          onChangeText={(t) => { setNewPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
          keyboardType="number-pad"
          secureTextEntry
          placeholder="••••"
          placeholderTextColor={colors.subtext}
          style={[styles.pinInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
        />
        <Text style={[styles.pinInputLabel, { color: colors.subtext }]}>Confirm new PIN</Text>
        <TextInput
          value={newConfirmPin}
          onChangeText={(t) => { setNewConfirmPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
          keyboardType="number-pad"
          secureTextEntry
          placeholder="••••"
          placeholderTextColor={colors.subtext}
          style={[styles.pinInput, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity onPress={resetPinAfterRecovery} style={[styles.btnPill, { borderColor: accent, marginTop: 8, backgroundColor: themeMode === 'dark' ? '#000' : '#fff' }]}>
          <Text style={[styles.btnText, { color: accent }]}>Reset PIN</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  iconWrap: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 14, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  btnPill: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 30, alignItems: 'center', borderWidth: 1.5 },
  btnFull: { paddingVertical: 14, borderRadius: 30, width: '100%', alignItems: 'center', borderWidth: 1.5 },
  btnText: { fontWeight: '600', fontSize: 15 },
  linkText: { fontSize: 13, marginTop: 12 },
  recoveryBox: { borderRadius: 14, borderWidth: 1, padding: 18, width: '100%', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  recoveryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recoveryWord: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  recoveryWordNum: { fontSize: 11 },
  recoveryWordText: { fontSize: 13, fontWeight: '600' },
  warningBox: { borderRadius: 10, padding: 12, marginBottom: 20, width: '100%' },
  warningText: { fontSize: 12, lineHeight: 17 },
  pinInputLabel: { fontSize: 12, marginBottom: 6 },
  pinInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 18, width: 160, textAlign: 'center', marginBottom: 14, letterSpacing: 8 },
  recoveryInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, width: '100%', minHeight: 80, marginBottom: 14, textAlignVertical: 'top' },
  errorText: { color: '#e11d48', fontSize: 12, marginBottom: 12 },
});