import React, { useRef, useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, Dimensions, Animated, Platform, Image, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { pickerActive } from './pickerState';
import { useTheme } from './ThemeContext';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Bounding box for live camera scanner box
const liveBoxWidth = screenWidth * 0.82;
const liveBoxHeight = liveBoxWidth * 1.414; // A4 aspect ratio
const liveBoxLeft = (screenWidth - liveBoxWidth) / 2;
const liveBoxTop = (screenHeight - liveBoxHeight) / 2 - 45;

export default function CameraScreen({ onCapture, onClose }) {
  const { mode, colors, accent } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [isDocMode, setIsDocMode] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null); // { uri, width, height }
  
  // Interactive crop coordinates (state in pixels)
  const [containerLayout, setContainerLayout] = useState({ x: 0, y: 0, width: screenWidth, height: screenHeight - 140 });
  const [boxX, setBoxX] = useState(0);
  const [boxY, setBoxY] = useState(0);
  const [boxW, setBoxW] = useState(0);
  const [boxH, setBoxH] = useState(0);

  const ref = useRef(null);
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      (async () => {
        try {
          pickerActive.value = true;
          await requestPermission();
        } catch (e) {
          console.error('Camera permission request failed:', e);
        } finally {
          setTimeout(() => {
            pickerActive.value = false;
          }, 1000);
        }
      })();
    }
  }, [permission]);

  // Live laser scan line animation
  useEffect(() => {
    if (isDocMode && !capturedPhoto) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 2200,
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 2200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scanAnim.setValue(0);
    }
  }, [isDocMode, capturedPhoto]);

  // Reset/Initialize crop box coordinates when a photo is taken
  useEffect(() => {
    if (capturedPhoto && containerLayout.width > 0) {
      const imgW = capturedPhoto.width;
      const imgH = capturedPhoto.height;
      const areaW = containerLayout.width;
      const areaH = containerLayout.height;

      const imgRatio = imgW / imgH;
      const areaRatio = areaW / areaH;

      let pW, pH;
      if (imgRatio > areaRatio) {
        pW = areaW;
        pH = areaW / imgRatio;
      } else {
        pH = areaH;
        pW = areaH * imgRatio;
      }

      const imgL = (areaW - pW) / 2;
      const imgT = (areaH - pH) / 2;

      // Start with a centered crop frame covering 80% of the image preview
      setBoxX(imgL + pW * 0.1);
      setBoxY(imgT + pH * 0.1);
      setBoxW(pW * 0.8);
      setBoxH(pH * 0.8);
    }
  }, [capturedPhoto, containerLayout.width, containerLayout.height]);

  const toggleFacing = () => {
    setFacing(prev => (prev === 'back' ? 'front' : 'back'));
  };

  const takePhoto = async () => {
    if (processing || !ref.current) return;
    setProcessing(true);
    try {
      const photo = await ref.current.takePictureAsync({ quality: 0.85 });
      if (isDocMode) {
        // Proceed to interactive crop preview step
        setCapturedPhoto({ uri: photo.uri, width: photo.width, height: photo.height });
      } else {
        // Direct capture in regular camera mode
        onCapture(photo.uri);
      }
    } catch (e) {
      console.error('Camera capture failed:', e.message);
    } finally {
      setProcessing(false);
    }
  };

  // Math coordinates to scale back to original image pixels
  const confirmCrop = async () => {
    if (processing || !capturedPhoto) return;
    setProcessing(true);
    try {
      const imgWidth = capturedPhoto.width;
      const imgHeight = capturedPhoto.height;
      const areaW = containerLayout.width;
      const areaH = containerLayout.height;

      const imgRatio = imgWidth / imgHeight;
      const areaRatio = areaW / areaH;

      let previewW, previewH;
      if (imgRatio > areaRatio) {
        previewW = areaW;
        previewH = areaW / imgRatio;
      } else {
        previewH = areaH;
        previewW = areaH * imgRatio;
      }

      const imageLeft = (areaW - previewW) / 2;
      const imageTop = (areaH - previewH) / 2;

      const scale = Math.max(areaH / imgHeight, areaW / imgWidth);
      const displayedWidth = imgWidth * scale;
      const displayedHeight = imgHeight * scale;
      const offsetX = (areaW - displayedWidth) / 2;
      const offsetY = (areaH - displayedHeight) / 2;

      // Transform crop coordinates from screen to high-res image coordinates
      const cropX = Math.max(0, (boxX - offsetX) / scale);
      const cropY = Math.max(0, (boxY - offsetY) / scale);
      const cropW = Math.min(imgWidth - cropX, boxW / scale);
      const cropH = Math.min(imgHeight - cropY, boxH / scale);

      const manipulated = await ImageManipulator.manipulateAsync(
        capturedPhoto.uri,
        [{
          crop: {
            originX: Math.round(cropX),
            originY: Math.round(cropY),
            width: Math.round(cropW),
            height: Math.round(cropH)
          }
        }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      onCapture(manipulated.uri);
    } catch (e) {
      console.error('Crop failed:', e);
    } finally {
      setProcessing(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.bg }]}>
        <Text style={[styles.permissionText, { color: colors.text }]}>Camera permission needed</Text>
        <TouchableOpacity onPress={onClose} style={[styles.permissionBtn, { backgroundColor: colors.cardBg, borderColor: accent, borderWidth: 1 }]}>
          <Text style={[styles.permissionBtnText, { color: accent }]}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Live laser scan calculation
  const liveTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, liveBoxHeight - 4],
  });

  // Render Interactive Crop Preview Screen
  if (capturedPhoto) {
    const imgW = capturedPhoto.width;
    const imgH = capturedPhoto.height;
    const areaW = containerLayout.width;
    const areaH = containerLayout.height;

    const imgRatio = imgW / imgH;
    const areaRatio = areaW / areaH;

    let pW = areaW;
    let pH = areaH;
    if (containerLayout.width > 0) {
      if (imgRatio > areaRatio) {
        pW = areaW;
        pH = areaW / imgRatio;
      } else {
        pH = areaH;
        pW = areaH * imgRatio;
      }
    }
    const imgL = (areaW - pW) / 2;
    const imgT = (areaH - pH) / 2;

    const handleCornerDrag = (evt, corner) => {
      const { pageX, pageY } = evt.nativeEvent;
      const localX = Math.max(imgL, Math.min(imgL + pW, pageX - containerLayout.x));
      const localY = Math.max(imgT, Math.min(imgT + pH, pageY - containerLayout.y));

      if (corner === 'topLeft') {
        const newX = localX;
        const newY = localY;
        const newW = (boxX + boxW) - newX;
        const newH = (boxY + boxH) - newY;
        if (newW >= 60 && newH >= 60) {
          setBoxX(newX);
          setBoxY(newY);
          setBoxW(newW);
          setBoxH(newH);
        }
      } else if (corner === 'topRight') {
        const newY = localY;
        const newW = localX - boxX;
        const newH = (boxY + boxH) - newY;
        if (newW >= 60 && newH >= 60) {
          setBoxY(newY);
          setBoxW(newW);
          setBoxH(newH);
        }
      } else if (corner === 'bottomLeft') {
        const newX = localX;
        const newW = (boxX + boxW) - newX;
        const newH = localY - boxY;
        if (newW >= 60 && newH >= 60) {
          setBoxX(newX);
          setBoxW(newW);
          setBoxH(newH);
        }
      } else if (corner === 'bottomRight') {
        const newW = localX - boxX;
        const newH = localY - boxY;
        if (newW >= 60 && newH >= 60) {
          setBoxW(newW);
          setBoxH(newH);
        }
      }
    };

    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <View style={styles.cropTitleBar}>
          <Text style={styles.cropTitle}>Crop Document</Text>
        </View>

        {/* Crop canvas area */}
        <View
          style={styles.cropCanvas}
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            setContainerLayout({ x, y, width, height });
          }}
        >
          <Image source={{ uri: capturedPhoto.uri }} style={{ position: 'absolute', left: imgL, top: imgT, width: pW, height: pH }} resizeMode="contain" />

          {/* Dimming mask outside the crop bounds */}
          <View style={[styles.dimmer, { top: 0, left: 0, right: 0, height: boxY }]} />
          <View style={[styles.dimmer, { top: boxY, bottom: areaH - (boxY + boxH), left: 0, width: boxX }]} />
          <View style={[styles.dimmer, { top: boxY, bottom: areaH - (boxY + boxH), right: 0, width: areaW - (boxX + boxW) }]} />
          <View style={[styles.dimmer, { bottom: 0, left: 0, right: 0, height: areaH - (boxY + boxH) }]} />

          {/* Interactive Bounding Frame */}
          <View style={[styles.scanBox, { left: boxX, top: boxY, width: boxW, height: boxH, borderColor: accent }]}>
            {/* Corner Indicators */}
            <View style={[styles.corner, { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3, borderColor: accent }]} />
            <View style={[styles.corner, { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3, borderColor: accent }]} />
            <View style={[styles.corner, { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: accent }]} />
            <View style={[styles.corner, { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3, borderColor: accent }]} />

            {/* Helper Grid Lines */}
            <View style={[styles.gridLineV, { left: '33.3%', borderColor: 'rgba(255,255,255,0.25)' }]} />
            <View style={[styles.gridLineV, { left: '66.6%', borderColor: 'rgba(255,255,255,0.25)' }]} />
            <View style={[styles.gridLineH, { top: '33.3%', borderColor: 'rgba(255,255,255,0.25)' }]} />
            <View style={[styles.gridLineH, { top: '66.6%', borderColor: 'rgba(255,255,255,0.25)' }]} />
          </View>

          {/* Interactive Corner Grips */}
          <View onStartShouldSetResponder={() => true} onResponderMove={(evt) => handleCornerDrag(evt, 'topLeft')} style={[styles.handleTouch, { left: boxX - 25, top: boxY - 25 }]} pointerEvents="auto">
            <View style={[styles.handleInner, { backgroundColor: accent, borderColor: '#fff' }]} />
          </View>
          <View onStartShouldSetResponder={() => true} onResponderMove={(evt) => handleCornerDrag(evt, 'topRight')} style={[styles.handleTouch, { left: boxX + boxW - 25, top: boxY - 25 }]} pointerEvents="auto">
            <View style={[styles.handleInner, { backgroundColor: accent, borderColor: '#fff' }]} />
          </View>
          <View onStartShouldSetResponder={() => true} onResponderMove={(evt) => handleCornerDrag(evt, 'bottomLeft')} style={[styles.handleTouch, { left: boxX - 25, top: boxY + boxH - 25 }]} pointerEvents="auto">
            <View style={[styles.handleInner, { backgroundColor: accent, borderColor: '#fff' }]} />
          </View>
          <View onStartShouldSetResponder={() => true} onResponderMove={(evt) => handleCornerDrag(evt, 'bottomRight')} style={[styles.handleTouch, { left: boxX + boxW - 25, top: boxY + boxH - 25 }]} pointerEvents="auto">
            <View style={[styles.handleInner, { backgroundColor: accent, borderColor: '#fff' }]} />
          </View>
        </View>

        {/* Crop Controls */}
        <View style={styles.cropControls}>
          <TouchableOpacity onPress={() => setCapturedPhoto(null)} style={[styles.cropBtn, { borderColor: accent, backgroundColor: mode === 'dark' ? '#000' : '#fff' }]}>
            <Ionicons name="camera-outline" size={20} color={accent} style={{ marginRight: 6 }} />
            <Text style={[styles.cropBtnText, { color: accent }]}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={confirmCrop} disabled={processing} style={[styles.cropBtn, { borderColor: accent, backgroundColor: mode === 'dark' ? '#000' : '#fff' }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={accent} style={{ marginRight: 6 }} />
            <Text style={[styles.cropBtnText, { color: accent }]}>{processing ? "Saving..." : "Confirm Crop"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render Camera Screen View
  return (
    <View style={styles.container}>
      <CameraView ref={ref} facing={facing} style={styles.camera}>
        
        {/* Document scan box overlay */}
        {isDocMode && (
          <View style={styles.overlayContainer} pointerEvents="none">
            {/* Dimming backgrounds around scanning area */}
            <View style={[styles.dimmer, { top: 0, left: 0, right: 0, height: liveBoxTop }]} />
            <View style={[styles.dimmer, { top: liveBoxTop, bottom: screenHeight - (liveBoxTop + liveBoxHeight), left: 0, width: liveBoxLeft }]} />
            <View style={[styles.dimmer, { top: liveBoxTop, bottom: screenHeight - (liveBoxTop + liveBoxHeight), right: 0, width: liveBoxLeft }]} />
            <View style={[styles.dimmer, { bottom: 0, left: 0, right: 0, height: screenHeight - (liveBoxTop + liveBoxHeight) }]} />

            {/* Document Bounding Frame */}
            <View style={[styles.scanBox, { left: liveBoxLeft, top: liveBoxTop, width: liveBoxWidth, height: liveBoxHeight, borderColor: accent }]}>
              {/* Corner Accents */}
              <View style={[styles.corner, { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderColor: accent }]} />
              <View style={[styles.corner, { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderColor: accent }]} />
              <View style={[styles.corner, { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: accent }]} />
              <View style={[styles.corner, { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderColor: accent }]} />
              
              {/* Laser scanning line */}
              <Animated.View style={[styles.scanLine, { backgroundColor: accent, transform: [{ translateY: liveTranslateY }] }]} />
            </View>

            {/* Hint text */}
            <View style={[styles.hintWrap, { top: liveBoxTop + liveBoxHeight + 12 }]}>
              <Text style={styles.hintText}>Align document within frame</Text>
            </View>
          </View>
        )}

        {/* Camera Mode Selector above Shutter Button */}
        <View style={styles.modeSelectorRow}>
          <TouchableOpacity onPress={() => setIsDocMode(false)} activeOpacity={0.8} style={styles.modeTab}>
            <Text style={[styles.modeText, !isDocMode && styles.activeModeText]}>PHOTO</Text>
            {!isDocMode && <View style={[styles.activeIndicator, { backgroundColor: accent }]} />}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsDocMode(true)} activeOpacity={0.8} style={styles.modeTab}>
            <Text style={[styles.modeText, isDocMode && [styles.activeModeText, { color: accent }]]}>DOCUMENT</Text>
            {isDocMode && <View style={[styles.activeIndicator, { backgroundColor: accent }]} />}
          </TouchableOpacity>
        </View>

        {/* Bottom controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={onClose} style={styles.controlBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={takePhoto} disabled={processing} style={styles.shutterBtn}>
            <View style={[styles.shutterInner, processing && { backgroundColor: accent, scale: 0.8 }]} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleFacing} style={styles.controlBtn}>
            <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  permissionText: { fontSize: 16, marginBottom: 20, textAlign: 'center' },
  permissionBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 24 },
  permissionBtnText: { fontWeight: '600', fontSize: 15 },
  
  // Camera Mode Selectors
  modeSelectorRow: { position: 'absolute', bottom: 140, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 32, zIndex: 12 },
  modeTab: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  modeText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1.2, opacity: 0.5, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  activeModeText: { opacity: 1 },
  activeIndicator: { width: 5, height: 5, borderRadius: 2.5, marginTop: 5 },

  // Live Camera overlays
  overlayContainer: { ...StyleSheet.absoluteFillObject, zIndex: 5 },
  dimmer: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  scanBox: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', overflow: 'hidden' },
  corner: { position: 'absolute', width: 16, height: 16 },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 2.5, opacity: 0.85, shadowColor: '#fff', shadowOpacity: 0.8, shadowRadius: 3, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  hintWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hintText: { color: '#fff', fontSize: 13, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },

  // Camera Capture buttons
  controlsRow: { position: 'absolute', bottom: 44, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 20, zIndex: 12 },
  controlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  shutterBtn: { width: 78, height: 78, borderRadius: 39, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },

  // Interactive Crop Layouts
  cropTitleBar: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 28, left: 0, right: 0, alignItems: 'center', zIndex: 12 },
  cropTitle: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  cropCanvas: { flex: 1, backgroundColor: '#000', marginBottom: 100 },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, borderStyle: 'dotted', borderWidth: 0.5 },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, borderStyle: 'dotted', borderWidth: 0.5 },
  handleTouch: { position: 'absolute', width: 50, height: 50, justifyContent: 'center', alignItems: 'center', zIndex: 20 },
  handleInner: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5 },
  cropControls: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, backgroundColor: '#000', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 20, zIndex: 12 },
  cropBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24, borderWidth: 1.5 },
  cropBtnText: { fontSize: 14, fontWeight: '700' }
});