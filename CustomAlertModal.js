import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { registerAlertListener } from './customAlert';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';

export default function CustomAlertModal() {
  const { colors, accent } = useTheme();
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState([]);

  useEffect(() => {
    registerAlertListener((t, m, btns) => {
      setTitle(t || '');
      setMessage(m || '');
      setButtons(btns || []);
      setVisible(true);
    });
    return () => registerAlertListener(null);
  }, []);

  if (!visible) return null;

  // Determine alert type based on title keywords for beautiful icons
  const getAlertIcon = () => {
    const t = title.toLowerCase();
    const m = message.toLowerCase();
    if (t.includes('error') || t.includes('fail') || t.includes('mismatch') || m.includes('fail') || m.includes('error')) {
      return { name: 'close-circle-outline', color: '#ff3b30' };
    }
    if (t.includes('success') || t.includes('saved') || t.includes('complete') || t.includes('cleared')) {
      return { name: 'checkmark-circle-outline', color: '#34c759' };
    }
    if (t.includes('delete') || t.includes('warning') || t.includes('weak') || t.includes('remove')) {
      return { name: 'alert-circle-outline', color: '#ff9500' };
    }
    return { name: 'information-circle-outline', color: accent || '#5b6cf0' };
  };

  const iconInfo = getAlertIcon();

  const handleButtonPress = (btnOnPress) => {
    setVisible(false);
    if (btnOnPress) {
      btnOnPress();
    }
  };

  // If no buttons are provided, default to an "OK" button
  const alertButtons = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.container, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={styles.iconContainer}>
            <Ionicons name={iconInfo.name} size={54} color={iconInfo.color} />
          </View>
          
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: colors.subtext }]}>{message}</Text> : null}

          <View style={[styles.buttonContainer, alertButtons.length > 2 ? styles.buttonContainerVertical : styles.buttonContainerHorizontal]}>
            {alertButtons.map((btn, index) => {
              const isCancel = btn.style === 'cancel' || btn.text?.toLowerCase() === 'cancel';
              const isDestructive = btn.style === 'destructive' || btn.text?.toLowerCase() === 'delete';
              
              let buttonBg = colors.bg;
              let textColor = colors.text;
              let buttonBorderColor = colors.border;
              
              if (isDestructive) {
                buttonBg = '#ff3b30';
                textColor = '#ffffff';
                buttonBorderColor = '#ff3b30';
              } else if (!isCancel) {
                buttonBg = accent || '#5b6cf0';
                textColor = '#ffffff';
                buttonBorderColor = accent || '#5b6cf0';
              }

              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleButtonPress(btn.onPress)}
                  style={[
                    styles.button,
                    { backgroundColor: buttonBg, borderColor: buttonBorderColor },
                    alertButtons.length > 2 ? styles.buttonVertical : styles.buttonHorizontal
                  ]}
                >
                  <Text style={[styles.buttonText, { color: textColor, fontWeight: !isCancel ? '600' : '500' }]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '80%',
    maxWidth: 320,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 8,
  },
  buttonContainerHorizontal: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonContainerVertical: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonHorizontal: {
    flex: 1,
  },
  buttonVertical: {
    width: '100%',
  },
  buttonText: {
    fontSize: 14,
  },
});
