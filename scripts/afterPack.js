// © 2026 RampantOctopus Softworks
//
// On macOS 26, files touched from a TCC-protected folder (~/Documents,
// ~/Desktop, ~/Downloads) get stamped with a com.apple.provenance /
// com.apple.macl extended attribute. codesign refuses to sign over it:
// "resource fork, Finder information, or similar detritus not allowed".
//
// Building from ~/Developer (outside those protected folders) avoids this
// at the source — that's the primary fix. This hook strips the attributes
// from every file and directory in the packaged app as a second line of
// defense, in case anything in node_modules or the packaged output picked
// up the stamp along the way. Same fix applied to XML2Excel and TC-100.
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appBundle = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

  let entries = [];
  try {
    entries = execFileSync('find', [appBundle], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    console.warn('afterPack: could not enumerate app bundle contents (non-fatal):', err.message);
    return;
  }

  let stripped = 0;
  for (const entry of entries) {
    try { execFileSync('xattr', ['-d', 'com.apple.provenance', entry]); stripped++; } catch {}
    try { execFileSync('xattr', ['-c', entry]); } catch {}
  }

  console.log(`afterPack: xattr-stripped ${entries.length} entries in ${appBundle} (${stripped} had provenance attr)`);
};
