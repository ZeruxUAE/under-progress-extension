# Under Progress Browser Extension

This is the standalone Chrome and Microsoft Edge extension for **Under Progress**. It gives people direct, reversible tools for the page they are currently visiting: text scaling, line spacing, reading width, high contrast, focus mode, text-to-speech, and persistent saved presets.

## Download

Download the latest release from [GitHub Releases](https://github.com/ZeruxUAE/under-progress-extension/releases/latest). Extract the ZIP before following the installation steps below.

## Install in Chrome or Microsoft Edge

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Microsoft Edge.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this folder.
5. Pin the Under Progress icon and open any ordinary website to use the controls.

## How it works

Settings are saved in the browser’s built-in extension storage and applied only as a display layer in the active tab. The original website is not permanently modified. Use the popup to save several named presets or set one preset as the default that opens again after the browser closes. Use **Reset this page** to restore the standard display controls.

## Website connection

With the extension installed, refresh `https://under-progress-psi.vercel.app/setup` once in the same browser. Then select **Connect extension** to import the extension’s current controls, or save the profile to send its text, spacing, contrast, focus choices, multiple disability selections, and default-preset name to the extension. The setup page now retries the connection automatically for several seconds instead of treating a newly installed extension as missing. The bridge uses only in-browser messages and Chrome/Edge extension storage; it does not send profile data to an external server.

If the Under Progress website moves to a custom domain later, update the `WEBSITE_ORIGINS` array in `content.js` before loading the extension.

## Read Aloud and language voices

Read Aloud uses only a voice that matches the language selected in Under Progress. This avoids having English text read with an unrelated accent or using the browser’s default language without the person’s consent. The extension first checks browser-page voices and then Chrome/Edge extension voices. If neither has a match, the popup shows **Set up a language voice**. On Windows, open the button and follow the device steps to add the selected language under **Settings → Speech → Manage voices → Add voices**, then restart the browser. The extension will not silently substitute a different-language voice.

Use the **Speech speed** and **Speech pitch** sliders in the popup to adjust delivery from 0.5× to 2.0× speed and 0.5× to 1.5× pitch. These choices are saved in extension storage and are applied to Read Aloud on ordinary supported webpages, including the matching Chrome/Edge speech-engine recovery path.

For a page written in a different language from the saved voice, turn on **Translate before speaking** before reading selected text. This optional feature is limited to 430 characters and uses the free MyMemory service only for the text explicitly selected for speech.

## Browser permissions

The extension requests only the permissions needed to work: access to the active tab, scripting access for display adjustments, browser storage for saved preferences, and browser text-to-speech access for matching language voices. Profiles are never sent to an external server. **Free translation is optional:** if you turn on **Translate before speaking**, the short selected text you ask to read (up to 430 characters) is sent to the MyMemory translation service before the extension speaks it in your saved language. The service is not used when that toggle is off.
