const fs = require('fs');
const path = require('path');

const files = [
  'src/features/dashboard/screens/HomeScreen.tsx',
  'src/features/scanning/screens/ScanScreen.tsx',
  'src/features/notifications/screens/NotificationScreenNew.tsx',
  'src/features/incharge/screens/MyClassHubScreen.tsx',
  'src/navigation/MainTabNavigator.tsx',
  'src/components/WatchlistCard.tsx'
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`File note found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Make sure Fonts is imported
  if (!content.includes('Fonts')) {
    // Find where Colors is imported and add Fonts
    if (content.includes("import { Colors } from")) {
      content = content.replace(/import { Colors } from '([^']+)'/, `import { Colors, Fonts } from '$1'`);
    } else if (content.includes('import { Colors, Layout } from')) {
      content = content.replace(/import { Colors, Layout } from '([^']+)'/, `import { Colors, Layout, Fonts } from '$1'`);
    } else {
       // Guess the relative path based on the file depth
       const parts = file.split('/');
       const depth = parts.length - 2;
       let relativePath = '';
       for(let i=0; i<depth; i++) relativePath += '../';
       content = `import { Fonts } from '${relativePath}constants';\n` + content;
    }
  }

  // Replace font weights
  content = content.replace(/fontWeight:\s*['"]700['"]/g, "fontFamily: Fonts.family.bold");
  content = content.replace(/fontWeight:\s*['"]600['"]/g, "fontFamily: Fonts.family.semiBold");
  content = content.replace(/fontWeight:\s*['"]500['"]/g, "fontFamily: Fonts.family.medium");
  content = content.replace(/fontWeight:\s*['"]400['"]/g, "fontFamily: Fonts.family.regular");
  content = content.replace(/fontWeight:\s*['"]normal['"]/g, "fontFamily: Fonts.family.regular");
  content = content.replace(/fontWeight:\s*['"]bold['"]/g, "fontFamily: Fonts.family.bold");

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated fonts in ${filePath}`);
});
