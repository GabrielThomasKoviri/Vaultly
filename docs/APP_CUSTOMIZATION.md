# App Customisation Guide

This guide explains how to change the app name and icon for the PersonalVault Expo project.

## Change the App Name
1. Open **app.json** in the project root.
2. Edit the `name` and `slug` fields to your desired name. Example:
   ```json
   {
     "name": "MyVault",
     "slug": "myvault",
     ...
   }
   ```
3. For Android, also update `android.package` if you need a new package identifier.
4. For iOS, update `ios.bundleIdentifier` accordingly.
5. Save the file.

## Change the App Icon
1. Replace the image at **assets/icon.png** with your new square icon (recommended size 1024×1024 PNG).
2. If you want platform‑specific icons, replace the files in:
   - Android: `android/app/src/main/res/mipmap-*/ic_launcher.png`
   - iOS: `ios/YourApp/Images.xcassets/AppIcon.appiconset` (you can replace the existing PNGs or use Xcode to generate them).
3. Run `expo start` again. The new icon will be used in the development build. For a production build, run `eas build`.

## Verify Changes
- Run the app (`npm start` or `expo start`). The splash screen and app icon should reflect the new assets.
- On Android, you may need to clear the app data or reinstall to see the updated icon.
- On iOS, uninstall the app from the simulator/device and reinstall.

## Additional Resources
- Expo app configuration: https://docs.expo.dev/versions/v56.0.0/config/app/
- Changing Android package name: https://docs.expo.dev/versions/v56.0.0/config/app/#android
- Changing iOS bundle identifier: https://docs.expo.dev/versions/v56.0.0/config/app/#ios

Add a link to this guide from the Settings screen for easy access.
