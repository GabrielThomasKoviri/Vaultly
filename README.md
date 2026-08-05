# 🔐 Vaultly - Offline Secure Vault & Media Storage

**Vaultly** is a privacy-first, 100% offline React Native application built with Expo SDK 56. It provides a secure personal digital vault designed to organize, search, and protect confidential media, images, videos, audio, and documents locally on your device without wasting time searching for files.

---

## ✨ Features

- 🔍 **Instant Search & Smart Organization**
  - **Save Time**: Instantly find any stored photo, video, document, or audio file with real-time search filtering.
  - **Search History**: Saves recent search queries so you can re-access frequent files in a single tap.
  - **Category & Tag Filtering**: Organize items neatly by type and tags so you never waste time hunting for confidential files.

- 🔒 **Local PIN & Biometric Authentication**
  - Secure PIN lock with PBKDF2/SHA256 salted hashing.
  - Hardware biometric unlock (Fingerprint / Face ID).
  - Recovery security questions for PIN resets.
  - Auto-lock protection when backgrounded.

- 📁 **Media & Document Management**
  - Store photos, videos, audio recordings, and documents in isolated local storage.
  - In-app media player and document previewer.
  - Custom file sorting, search history, and tag filtering.

- 📷 **Built-in Camera**
  - Capture photos directly inside the vault without saving them to the public system gallery.

- 📥 **Native Share Intent**
  - Share files, photos, or documents directly from any external app straight into Vaultly.

- 📦 **Password-Protected Backup & Restore**
  - Export your entire vault into an encrypted ZIP backup file.
  - Easily restore backup archives on new devices.

- 🎨 **Custom Themes & Personalization**
  - Dark Mode and Light Mode support.
  - Customizable accent colors with a full HSV color picker.

- 🛡️ **100% Offline & Private**
  - Zero cloud tracking, no backend servers, and total user privacy.

---

## 📱 Quick Install via Prebuilt APK (No Setup Required)

If you just want to install and use **Vaultly** on your Android phone without setting up Node.js, Android Studio, or React Native development tools, prebuilt APKs are provided directly in the [`apk/`](./apk) directory of this repository:

- 📥 [**`Vaultly-arm64-v8a.apk`**](./apk/Vaultly-arm64-v8a.apk) *(Recommended for most modern 64-bit Android smartphones)*
- 📥 [**`Vaultly-armeabi-v7a.apk`**](./apk/Vaultly-armeabi-v7a.apk) *(For older 32-bit Android smartphones)*
- 📥 [**`Vaultly-x86_64.apk`**](./apk/Vaultly-x86_64.apk) *(For Android emulators and Chromebooks)*

### Installation Steps on Android:
1. Download the appropriate `.apk` file (e.g., [`Vaultly-arm64-v8a.apk`](./apk/Vaultly-arm64-v8a.apk)) onto your Android device.
2. Open your device's File Manager and tap the downloaded `.apk` file.
3. If prompted by Android, enable **"Allow installation from unknown sources"** for your file manager or browser.
4. Tap **Install** and open **Vaultly**!

---

## 💻 Running from Source Code (Development Setup)

If you want to modify the code or run the application in a development environment, follow these steps:

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Android Studio with Android SDK & NDK configured (or a physical Android device with USB Debugging enabled).

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/PersonalVault.git
   cd PersonalVault
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the Metro Bundler (Development Server):**
   ```bash
   npx expo start
   ```
   - **What it does:** Starts the Metro JavaScript bundler.
   - **Why use it:** Metro compiles your JavaScript application code, listens for live changes as you code (Hot Reloading), and displays interactive options and a QR code for debugging.

4. **Compile & Run on Android Device / Emulator:**
   ```bash
   npm run android
   # or
   npx expo run:android
   ```
   - **What it does:** 
     1. Invokes the Android Gradle build system inside the `android/` directory.
     2. Compiles native C++, Java, and Kotlin source code for libraries like SQLite, Biometrics, and Share Intent handlers.
     3. Generates a development debug APK, installs it onto your connected Android device or emulator, and automatically launches the app attached to Metro.
   - **Why use it:** Since Vaultly relies on native device features (SQLite database, Local Biometrics, Camera, Native Share Intents), standard Expo Go cannot run these native modules. `npm run android` builds and links these native Android capabilities directly.

---

## 🏗️ How to Build Your Own Release APK (Production Build)

To generate an optimized, standalone release APK file from source:

1. **Navigate to the `android/` directory:**
   ```bash
   cd android
   ```

2. **Execute the Gradle release build task:**
   - **On Linux / macOS:**
     ```bash
     ./gradlew assembleRelease
     ```
   - **On Windows:**
     ```cmd
     gradlew.bat assembleRelease
     ```

3. **Locate your generated Release APKs:**
   Once the Gradle task finishes (`BUILD SUCCESSFUL`), your release APK files will be generated in:
   ```
   android/app/build/outputs/apk/release/
   ```
   - `app-arm64-v8a-release.apk` (For 64-bit ARM devices)
   - `app-armeabi-v7a-release.apk` (For 32-bit ARM devices)
   - `app-x86_64-release.apk` (For 64-bit x86 emulators/devices)

---

## 🛠️ Tech Stack

- **Framework**: React Native with [Expo SDK 56](https://expo.dev)
- **Database**: SQLite (`expo-sqlite`)
- **Security**: `expo-crypto`, `expo-local-authentication`
- **Media & File System**: `expo-file-system`, `expo-camera`, `expo-image-picker`, `expo-media-library`
- **Archiving**: `react-native-zip-archive`
- **Styling & UI**: Custom Design System with Reanimated animations

---

## 🤝 Support & Contact

If you have questions, feature requests, or need support, feel free to open an issue or reach out directly:

- **Developer**: Gabriel Thomas
- **Email**: [dev.gabrielthomas@gmail.com](mailto:dev.gabrielthomas@gmail.com)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
