import React, { useRef } from 'react';
import { View, PanResponder } from 'react-native';
import { clamp, hsvToHex, HUE_COLORS } from '../utils/colorUtils';

export const PICKER_WIDTH = 260;
export const PICKER_HEIGHT = 160;

export function ColorPickerArea({ hue, sat, val, onChangeSV }) {
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => handleTouch(e),
      onPanResponderMove: (e) => handleTouch(e),
    })
  ).current;

  const handleTouch = (e) => {
    const { locationX, locationY } = e.nativeEvent;
    const x = clamp(locationX, 0, PICKER_WIDTH);
    const y = clamp(locationY, 0, PICKER_HEIGHT);
    onChangeSV(x / PICKER_WIDTH, 1 - y / PICKER_HEIGHT);
  };

  const baseColor = hsvToHex(hue, 1, 1);

  return (
    <View
      {...responder.panHandlers}
      style={{ width: PICKER_WIDTH, height: PICKER_HEIGHT, borderRadius: 10, overflow: 'hidden', backgroundColor: baseColor }}
    >
      {/* white -> transparent (saturation) */}
      <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#fff', opacity: 1 - sat }} />
      {/* transparent -> black (value) */}
      <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#000', opacity: 1 - val }} />
      {/* selector circle */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: clamp(sat * PICKER_WIDTH - 9, -9, PICKER_WIDTH - 9),
          top: clamp((1 - val) * PICKER_HEIGHT - 9, -9, PICKER_HEIGHT - 9),
          width: 18, height: 18, borderRadius: 9,
          borderWidth: 2, borderColor: '#fff',
          shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 2,
          backgroundColor: 'transparent'
        }}
      />
    </View>
  );
}

export function HueSlider({ hue, onChangeHue }) {
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => handleTouch(e),
      onPanResponderMove: (e) => handleTouch(e),
    })
  ).current;

  const handleTouch = (e) => {
    const { locationX } = e.nativeEvent;
    const x = clamp(locationX, 0, PICKER_WIDTH);
    onChangeHue((x / PICKER_WIDTH) * 360);
  };

  return (
    <View {...responder.panHandlers} style={{ width: PICKER_WIDTH, height: 24, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', marginTop: 12 }}>
      {HUE_COLORS.slice(0, -1).map((c, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: c }} />
      ))}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: clamp((hue / 360) * PICKER_WIDTH - 4, -4, PICKER_WIDTH - 4),
          top: -2, width: 8, height: 28, borderRadius: 4,
          backgroundColor: '#fff', borderWidth: 1, borderColor: '#888'
        }}
      />
    </View>
  );
}
