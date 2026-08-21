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

## Browser permissions

The extension requests only the permissions needed to work: access to the active tab, scripting access for display adjustments, and browser storage for a user’s saved preferences. It does not send profile settings or page content to an external server.
