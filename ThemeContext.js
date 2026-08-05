import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCENTS = {
  indigo: '#5b6cf0',
  teal: '#0d9488',
  rose: '#e11d48',
  amber: '#d97706',
  violet: '#7c3aed'
};

const LIGHT = {
  bg: '#f5f6fa', cardBg: '#fff', text: '#1c1c1e', subtext: '#9a9aa0',
  border: '#eceef2', inputBg: '#fff', inputBorder: '#e4e6eb', sheetBg: '#fff',
  overlay: 'rgba(0,0,0,0.35)', iconBg: '#eef0fb'
};

const DARK = {
  bg: '#121214', cardBg: '#1e1e22', text: '#f2f2f7', subtext: '#8e8e93',
  border: '#2c2c30', inputBg: '#2a2a2e', inputBorder: '#3a3a3e', sheetBg: '#1e1e22',
  overlay: 'rgba(0,0,0,0.6)', iconBg: '#2a2a40'
};

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [mode, setMode] = useState('light');
  const [accentKey, setAccentKey] = useState('indigo');
  const [customColor, setCustomColor] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const savedMode = await AsyncStorage.getItem('theme_mode');
        const savedAccent = await AsyncStorage.getItem('theme_accent');
        const savedCustom = await AsyncStorage.getItem('theme_custom_color');
        if (savedMode) setMode(savedMode);
        if (savedAccent) setAccentKey(savedAccent);
        if (savedCustom) setCustomColor(savedCustom);
      } catch (e) {
        console.error('Theme load failed:', e.message);
      }
      setLoaded(true);
    })();
  }, []);

  const toggleMode = async () => {
    const next = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    try { await AsyncStorage.setItem('theme_mode', next); } catch (e) {}
  };

  const setAccent = async (key) => {
    setAccentKey(key);
    try { await AsyncStorage.setItem('theme_accent', key); } catch (e) {}
  };

  const setCustom = async (hex) => {
    setCustomColor(hex);
    setAccentKey('custom');
    try {
      await AsyncStorage.setItem('theme_custom_color', hex);
      await AsyncStorage.setItem('theme_accent', 'custom');
    } catch (e) {}
  };

  const colors = mode === 'dark' ? DARK : LIGHT;
  const accent = accentKey === 'custom' && customColor ? customColor : (ACCENTS[accentKey] || ACCENTS.indigo);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ mode, toggleMode, colors, accent, accentKey, setAccent, ACCENTS, customColor, setCustom }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);