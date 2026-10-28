import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  FlatList,
  StyleSheet,
  PanResponder,
  Animated,
  StatusBar,
  BackHandler,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatSize, timeAgo } from '../utils/fileUtils';
import { useTheme } from '../ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function ZoomableImage({ item, isCurrent, onZoomChange, onPinchStateChange, onSingleTap, resetSignal }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const currentScale = useRef(1);
  const currentTranslateX = useRef(0);
  const currentTranslateY = useRef(0);

  // Pinch & Pan tracking
  const isPinching = useRef(false);
  const initialDistance = useRef(0);
  const initialScale = useRef(1);
  const initialTranslateX = useRef(0);
  const initialTranslateY = useRef(0);
  const initialMidX = useRef(0);
  const initialMidY = useRef(0);

  const panStartX = useRef(0);
  const panStartY = useRef(0);
  const baseTranslateX = useRef(0);
  const baseTranslateY = useRef(0);

  // Tap detection
  const tapStartTime = useRef(0);
  const tapStartX = useRef(0);
  const tapStartY = useRef(0);
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const lastTapY = useRef(0);
  const singleTapTimer = useRef(null);

  const resetZoom = useCallback((animate = true) => {
    currentScale.current = 1;
    currentTranslateX.current = 0;
    currentTranslateY.current = 0;
    isPinching.current = false;
    initialDistance.current = 0;
    if (onZoomChange) onZoomChange(1);
    if (onPinchStateChange) onPinchStateChange(false);

    if (animate) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7 }),
      ]).start();
    } else {
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
  }, [scale, translateX, translateY, onZoomChange, onPinchStateChange]);

  // When this item is no longer the current page, reset its zoom
  useEffect(() => {
    if (!isCurrent && currentScale.current > 1) {
      resetZoom(false);
    }
  }, [isCurrent, resetZoom]);

  // Handle external reset signal (e.g. from reset button)
  useEffect(() => {
    if (resetSignal) {
      resetZoom(true);
    }
  }, [resetSignal, resetZoom]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
      }
    };
  }, []);

  const setScaleAnimated = (targetScale, tapX, tapY) => {
    const clamped = Math.max(1, Math.min(4, targetScale));
    currentScale.current = clamped;
    isPinching.current = false;
    if (onPinchStateChange) onPinchStateChange(false);
    if (onZoomChange) onZoomChange(clamped);

    if (clamped <= 1.05) {
      currentTranslateX.current = 0;
      currentTranslateY.current = 0;
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7 }),
      ]).start();
    } else {
      let targetX = 0;
      let targetY = 0;
      if (typeof tapX === 'number' && typeof tapY === 'number') {
        const offsetX = tapX - SCREEN_WIDTH / 2;
        const offsetY = tapY - SCREEN_HEIGHT / 2;
        targetX = -offsetX * (clamped - 1);
        targetY = -offsetY * (clamped - 1);
        const maxPanX = (SCREEN_WIDTH * (clamped - 1)) / 2;
        const maxPanY = (SCREEN_HEIGHT * (clamped - 1)) / 2;
        targetX = Math.max(-maxPanX, Math.min(maxPanX, targetX));
        targetY = Math.max(-maxPanY, Math.min(maxPanY, targetY));
      }
      currentTranslateX.current = targetX;
      currentTranslateY.current = targetY;

      Animated.parallel([
        Animated.spring(scale, { toValue: clamped, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateX, { toValue: targetX, useNativeDriver: true, friction: 7 }),
        Animated.spring(translateY, { toValue: targetY, useNativeDriver: true, friction: 7 }),
      ]).start();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: (evt) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) {
          isPinching.current = true;
          if (onPinchStateChange) onPinchStateChange(true);
          return true;
        }
        return false;
      },
      onMoveShouldSetPanResponderCapture: (evt) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) {
          isPinching.current = true;
          if (onPinchStateChange) onPinchStateChange(true);
          return true;
        }
        return false;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) return true;
        if (currentScale.current > 1.05) {
          return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
        }
        return false;
      },
      onPanResponderTerminationRequest: (evt, gestureState) => {
        // Never allow FlatList to terminate if 2 or more touches exist
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) {
          return false;
        }
        // Never allow termination if actively pinching
        if (isPinching.current) {
          return false;
        }
        // Never allow termination if zoomed in
        if (currentScale.current > 1.05) {
          return false;
        }
        // If at 1x with 1 finger: ONLY yield to FlatList if clear horizontal swipe
        if (gestureState && Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5) {
          return true;
        }
        // Otherwise, do not terminate (protects taps and fast 2nd finger placement)
        return false;
      },
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        tapStartTime.current = Date.now();
        tapStartX.current = evt.nativeEvent.pageX;
        tapStartY.current = evt.nativeEvent.pageY;

        if (touches.length >= 2) {
          if (singleTapTimer.current) {
            clearTimeout(singleTapTimer.current);
            singleTapTimer.current = null;
          }
          lastTapTime.current = 0;
          isPinching.current = true;
          if (onPinchStateChange) onPinchStateChange(true);

          const dist = Math.hypot(
            touches[0].pageX - touches[1].pageX,
            touches[0].pageY - touches[1].pageY
          );
          initialDistance.current = dist > 0 ? dist : 1;
          initialScale.current = currentScale.current;
          initialTranslateX.current = currentTranslateX.current;
          initialTranslateY.current = currentTranslateY.current;
          initialMidX.current = (touches[0].pageX + touches[1].pageX) / 2;
          initialMidY.current = (touches[0].pageY + touches[1].pageY) / 2;
        } else if (touches.length === 1) {
          panStartX.current = touches[0].pageX;
          panStartY.current = touches[0].pageY;
          baseTranslateX.current = currentTranslateX.current;
          baseTranslateY.current = currentTranslateY.current;
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          const curDist = Math.hypot(
            touches[0].pageX - touches[1].pageX,
            touches[0].pageY - touches[1].pageY
          );

          if (!isPinching.current || initialDistance.current <= 0) {
            if (singleTapTimer.current) {
              clearTimeout(singleTapTimer.current);
              singleTapTimer.current = null;
            }
            lastTapTime.current = 0;
            isPinching.current = true;
            if (onPinchStateChange) onPinchStateChange(true);

            initialDistance.current = curDist > 0 ? curDist : 1;
            initialScale.current = currentScale.current;
            initialTranslateX.current = currentTranslateX.current;
            initialTranslateY.current = currentTranslateY.current;
            initialMidX.current = (touches[0].pageX + touches[1].pageX) / 2;
            initialMidY.current = (touches[0].pageY + touches[1].pageY) / 2;
            return;
          }

          if (initialDistance.current > 0) {
            const ratio = curDist / initialDistance.current;
            const nextScale = Math.max(0.7, Math.min(5, initialScale.current * ratio));

            const midX = (touches[0].pageX + touches[1].pageX) / 2;
            const midY = (touches[0].pageY + touches[1].pageY) / 2;
            const deltaMidX = midX - initialMidX.current;
            const deltaMidY = midY - initialMidY.current;

            const nextX = initialTranslateX.current + deltaMidX;
            const nextY = initialTranslateY.current + deltaMidY;

            scale.setValue(nextScale);
            translateX.setValue(nextX);
            translateY.setValue(nextY);

            currentScale.current = nextScale;
            currentTranslateX.current = nextX;
            currentTranslateY.current = nextY;
          }
        } else if (touches.length === 1) {
          if (isPinching.current) {
            isPinching.current = false;
            if (onPinchStateChange) onPinchStateChange(false);
            panStartX.current = touches[0].pageX;
            panStartY.current = touches[0].pageY;
            baseTranslateX.current = currentTranslateX.current;
            baseTranslateY.current = currentTranslateY.current;
            return;
          }

          if (currentScale.current > 1.05) {
            const dx = touches[0].pageX - panStartX.current;
            const dy = touches[0].pageY - panStartY.current;

            let nextX = baseTranslateX.current + dx;
            let nextY = baseTranslateY.current + dy;

            const maxPanX = Math.max(0, (SCREEN_WIDTH * (currentScale.current - 1)) / 2);
            const maxPanY = Math.max(0, (SCREEN_HEIGHT * (currentScale.current - 1)) / 2);

            if (nextX > maxPanX) nextX = maxPanX + (nextX - maxPanX) * 0.3;
            else if (nextX < -maxPanX) nextX = -maxPanX + (nextX + maxPanX) * 0.3;

            if (nextY > maxPanY) nextY = maxPanY + (nextY - maxPanY) * 0.3;
            else if (nextY < -maxPanY) nextY = -maxPanY + (nextY + maxPanY) * 0.3;

            translateX.setValue(nextX);
            translateY.setValue(nextY);
            currentTranslateX.current = nextX;
            currentTranslateY.current = nextY;
          }
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (isPinching.current) {
          isPinching.current = false;
          if (onPinchStateChange) onPinchStateChange(false);
          initialDistance.current = 0;
          lastTapTime.current = 0;
          if (singleTapTimer.current) {
            clearTimeout(singleTapTimer.current);
            singleTapTimer.current = null;
          }

          if (currentScale.current <= 1.05) {
            resetZoom(true);
          } else {
            const finalScale = Math.min(4, Math.max(1, currentScale.current));
            currentScale.current = finalScale;
            const maxPanX = Math.max(0, (SCREEN_WIDTH * (finalScale - 1)) / 2);
            const maxPanY = Math.max(0, (SCREEN_HEIGHT * (finalScale - 1)) / 2);
            const finalX = Math.max(-maxPanX, Math.min(maxPanX, currentTranslateX.current));
            const finalY = Math.max(-maxPanY, Math.min(maxPanY, currentTranslateY.current));

            currentTranslateX.current = finalX;
            currentTranslateY.current = finalY;

            Animated.parallel([
              Animated.spring(scale, { toValue: finalScale, useNativeDriver: true, friction: 7 }),
              Animated.spring(translateX, { toValue: finalX, useNativeDriver: true, friction: 7 }),
              Animated.spring(translateY, { toValue: finalY, useNativeDriver: true, friction: 7 }),
            ]).start();
            if (onZoomChange) onZoomChange(finalScale);
          }
          return;
        }

        const elapsed = Date.now() - tapStartTime.current;
        const pageX = evt.nativeEvent.pageX || 0;
        const pageY = evt.nativeEvent.pageY || 0;
        const dist = Math.hypot(pageX - tapStartX.current, pageY - tapStartY.current);
        const isTap = elapsed < 300 && dist < 15;

        if (isTap) {
          const now = Date.now();
          const timeSinceLastTap = now - lastTapTime.current;
          const tapDist = Math.hypot(pageX - lastTapX.current, pageY - lastTapY.current);

          if (timeSinceLastTap < 300 && tapDist < 40) {
            // Double tap detected!
            if (singleTapTimer.current) {
              clearTimeout(singleTapTimer.current);
              singleTapTimer.current = null;
            }
            lastTapTime.current = 0;
            if (currentScale.current > 1.05) {
              resetZoom(true);
            } else {
              setScaleAnimated(2.5, pageX, pageY);
            }
          } else {
            // Single tap candidate
            lastTapTime.current = now;
            lastTapX.current = pageX;
            lastTapY.current = pageY;
            if (singleTapTimer.current) {
              clearTimeout(singleTapTimer.current);
            }
            singleTapTimer.current = setTimeout(() => {
              singleTapTimer.current = null;
              if (onSingleTap) onSingleTap();
            }, 250);
          }
          return;
        }

        if (currentScale.current > 1.05) {
          const maxPanX = Math.max(0, (SCREEN_WIDTH * (currentScale.current - 1)) / 2);
          const maxPanY = Math.max(0, (SCREEN_HEIGHT * (currentScale.current - 1)) / 2);
          const finalX = Math.max(-maxPanX, Math.min(maxPanX, currentTranslateX.current));
          const finalY = Math.max(-maxPanY, Math.min(maxPanY, currentTranslateY.current));

          currentTranslateX.current = finalX;
          currentTranslateY.current = finalY;

          Animated.parallel([
            Animated.spring(translateX, { toValue: finalX, useNativeDriver: true, friction: 8 }),
            Animated.spring(translateY, { toValue: finalY, useNativeDriver: true, friction: 8 }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        if (singleTapTimer.current) {
          clearTimeout(singleTapTimer.current);
          singleTapTimer.current = null;
        }
        isPinching.current = false;
        initialDistance.current = 0;
        if (onPinchStateChange) onPinchStateChange(false);
        if (currentScale.current <= 1.05) {
          resetZoom(false);
        }
      },
    })
  ).current;

  return (
    <View style={styles.imageSlide} {...panResponder.panHandlers}>
      <Animated.Image
        source={{ uri: item.file_path }}
        style={[
          styles.slideImage,
          {
            transform: [
              { translateX },
              { translateY },
              { scale },
            ],
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

export default function ImageViewerModal({
  visible,
  items = [],
  initialIndex = 0,
  onClose,
  onShare,
  onDelete,
}) {
  const { accent } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [activeScale, setActiveScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const [zoomResetSignal, setZoomResetSignal] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const flatListRef = useRef(null);

  const toggleControls = useCallback(() => {
    setControlsVisible((prev) => {
      const next = !prev;
      Animated.timing(controlsOpacity, {
        toValue: next ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return next;
    });
  }, [controlsOpacity]);

  useEffect(() => {
    if (visible) {
      const idx = Math.max(0, Math.min(items.length - 1, initialIndex));
      setCurrentIndex(idx);
      setActiveScale(1);
      setIsPinching(false);
      setControlsVisible(true);
      controlsOpacity.setValue(1);
    }
  }, [visible, initialIndex, items.length, controlsOpacity]);

  useEffect(() => {
    if (!visible) return;
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => backSub.remove();
  }, [visible, onClose]);

  const currentItem = items[currentIndex] || null;

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      const nextIdx = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
      setCurrentIndex(nextIdx);
      setActiveScale(1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      flatListRef.current?.scrollToIndex({ index: prevIdx, animated: true });
      setCurrentIndex(prevIdx);
      setActiveScale(1);
    }
  };

  const onMomentumScrollEnd = (e) => {
    const offset = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offset / SCREEN_WIDTH);
    if (newIndex >= 0 && newIndex < items.length && newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
      setActiveScale(1);
    }
  };

  if (!visible || items.length === 0) return null;

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0c" hidden={!controlsVisible} />
      <View style={styles.container}>
        {/* Top App Bar with slide/fade animation */}
        <Animated.View
          style={[
            styles.topBar,
            {
              opacity: controlsOpacity,
              transform: [
                {
                  translateY: controlsOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-60, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents={controlsVisible ? 'auto' : 'none'}
        >
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>

          <View style={styles.counterWrap}>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {items.length}
            </Text>
            {activeScale > 1.05 && (
              <View style={[styles.zoomBadge, { borderColor: accent }]}>
                <Text style={[styles.zoomBadgeText, { color: accent }]}>
                  {Math.round(activeScale * 100)}%
                </Text>
              </View>
            )}
          </View>

          <View style={styles.topRightControls}>
            {activeScale > 1.05 && (
              <TouchableOpacity
                onPress={() => setZoomResetSignal((s) => s + 1)}
                style={[styles.smallActionBtn, { borderColor: accent, borderWidth: 1 }]}
              >
                <Ionicons name="refresh-outline" size={16} color={accent} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Gallery Carousel */}
        <FlatList
          ref={flatListRef}
          data={items}
          keyExtractor={(item, idx) => String(item.id || idx)}
          horizontal
          pagingEnabled
          scrollEnabled={activeScale <= 1.05 && !isPinching}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.max(0, Math.min(items.length - 1, initialIndex))}
          getItemLayout={(data, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item, index }) => (
            <ZoomableImage
              item={item}
              isCurrent={index === currentIndex}
              onZoomChange={index === currentIndex ? setActiveScale : undefined}
              onPinchStateChange={index === currentIndex ? setIsPinching : undefined}
              onSingleTap={toggleControls}
              resetSignal={index === currentIndex ? zoomResetSignal : 0}
            />
          )}
          style={{ flex: 1 }}
        />

        {/* Chevrons for Prev / Next Image */}
        {currentIndex > 0 && activeScale <= 1.05 && (
          <Animated.View
            style={[styles.navArrowWrap, styles.navArrowLeft, { opacity: controlsOpacity }]}
            pointerEvents={controlsVisible ? 'auto' : 'none'}
          >
            <TouchableOpacity onPress={handlePrev} style={styles.navArrow} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={28} color="#ffffffdd" />
            </TouchableOpacity>
          </Animated.View>
        )}
        {currentIndex < items.length - 1 && activeScale <= 1.05 && (
          <Animated.View
            style={[styles.navArrowWrap, styles.navArrowRight, { opacity: controlsOpacity }]}
            pointerEvents={controlsVisible ? 'auto' : 'none'}
          >
            <TouchableOpacity onPress={handleNext} style={styles.navArrow} activeOpacity={0.7}>
              <Ionicons name="chevron-forward" size={28} color="#ffffffdd" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Bottom Details & Actions Sheet with slide/fade animation */}
        {currentItem && (
          <Animated.View
            style={[
              styles.bottomBar,
              {
                opacity: controlsOpacity,
                transform: [
                  {
                    translateY: controlsOpacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [60, 0],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents={controlsVisible ? 'auto' : 'none'}
          >
            <View style={styles.fileDetails}>
              <Text style={styles.fileName} numberOfLines={1}>
                {currentItem.name}
              </Text>
              <Text style={styles.fileMeta}>
                {formatSize(currentItem.size)} • {timeAgo(currentItem.created_at)}
              </Text>
            </View>

            <View style={styles.actionRow}>
              {onShare && (
                <TouchableOpacity
                  onPress={() => onShare(currentItem)}
                  style={[styles.actionBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Share</Text>
                </TouchableOpacity>
              )}

              {onDelete && (
                <TouchableOpacity
                  onPress={() => onDelete(currentItem)}
                  style={[styles.actionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.85)' }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 24 : 44,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  counterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  counterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  zoomBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  zoomBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallActionBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  imageSlide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  navArrowWrap: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    zIndex: 9,
  },
  navArrowLeft: {
    left: 10,
  },
  navArrowRight: {
    right: 10,
  },
  navArrow: {
    width: 44,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(20, 20, 24, 0.88)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  fileDetails: {
    alignItems: 'center',
    marginBottom: 12,
  },
  fileName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  fileMeta: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 3,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
});

