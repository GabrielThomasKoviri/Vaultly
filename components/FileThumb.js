import React, { useState, useEffect } from 'react';
import { View, Text, Image } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { getExt, IMAGE_EXTS, VIDEO_EXTS } from '../utils/fileUtils';

const generateImageThumbnail = async (sourceUri, destUri) => {
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: 200, height: 200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    await FileSystem.copyAsync({ from: manipResult.uri, to: destUri });
    return destUri;
  } catch (e) {
    console.error('Failed to generate image thumbnail:', e.message);
    return null;
  }
};

const generateVideoThumbnail = async (sourceUri, destUri) => {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(sourceUri, {
      time: 1000,
    });
    await FileSystem.copyAsync({ from: uri, to: destUri });
    return destUri;
  } catch (e) {
    console.error('Failed to generate video thumbnail:', e.message);
    return null;
  }
};

const getDocIcon = (ext, type) => {
  if (type === 'note' || ext === 'txt') {
    return { name: 'note-text-outline', color: '#f59e0b' };
  }
  switch (ext) {
    case 'pdf':
      return { name: 'file-pdf-box', color: '#e53935' };
    case 'doc':
    case 'docx':
      return { name: 'file-word-box', color: '#1e88e5' };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { name: 'file-excel-box', color: '#2e7d32' };
    case 'ppt':
    case 'pptx':
      return { name: 'file-powerpoint-box', color: '#e65100' };
    case 'zip':
    case 'rar':
    case '7z':
      return { name: 'folder-zip-outline', color: '#7c3aed' };
    case 'html':
    case 'htm':
      return { name: 'file-code-outline', color: '#0284c7' };
    case 'mp3':
    case 'wav':
    case 'aac':
      return { name: 'file-music-outline', color: '#db2777' };
    default:
      return { name: 'file-document-outline', color: '#64748b' };
  }
};

export default function FileThumb({ item, size = 56 }) {
  const [thumbUri, setThumbUri] = useState(null);
  const ext = getExt(item);
  const isNote = item?.type === 'note' || ext === 'txt';
  const isImage = !isNote && (item?.type === 'image' || item?.type === 'scan' || IMAGE_EXTS.includes(ext));
  const isVideo = !isNote && (item?.type === 'video' || VIDEO_EXTS.includes(ext));

  useEffect(() => {
    let active = true;
    const checkOrGenerate = async () => {
      if (isNote || (!isImage && !isVideo)) return;
      const hashOrId = item?.file_hash || `legacy_${item?.id || 'temp'}`;
      const cacheUri = `${FileSystem.cacheDirectory}thumb_${hashOrId}.jpg`;
      try {
        const info = await FileSystem.getInfoAsync(cacheUri);
        if (info.exists) {
          if (active) setThumbUri(cacheUri);
        } else {
          let generated = null;
          if (isImage) {
            generated = await generateImageThumbnail(item.file_path, cacheUri);
          } else if (isVideo) {
            generated = await generateVideoThumbnail(item.file_path, cacheUri);
          }
          if (generated && active) {
            setThumbUri(generated);
          }
        }
      } catch (e) {
        console.error('Thumbnail check failed:', e.message);
      }
    };
    checkOrGenerate();
    return () => { active = false; };
  }, [item?.id, item?.file_path, item?.file_hash, isNote, isImage, isVideo]);

  if (isImage) {
    const sourceUri = thumbUri || item?.file_path;
    return (
      <View style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden', backgroundColor: '#222' }}>
        <Image
          source={{ uri: sourceUri }}
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      </View>
    );
  }

  if (isVideo) {
    const sourceUri = thumbUri || item?.file_path;
    return (
      <View style={{ width: size, height: size, borderRadius: 6, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
        {sourceUri ? (
          <Image source={{ uri: sourceUri }} style={{ width: size, height: size, position: 'absolute' }} resizeMode="cover" />
        ) : null}
        <Ionicons name="play-circle" size={size * 0.5} color="#fff" />
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 2 }}>
          <Text style={{ color: '#fff', fontSize: 8, textAlign: 'center', fontWeight: '700' }}>VIDEO</Text>
        </View>
      </View>
    );
  }

  const docIcon = getDocIcon(ext, item?.type);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <MaterialCommunityIcons name={docIcon.name} size={size} color={docIcon.color} />
    </View>
  );
}
