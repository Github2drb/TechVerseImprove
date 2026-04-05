/**
 * One-Time Data Migration Script
 * Location: scripts/fix-engineer-names.ts
 * Purpose: Fix existing engineer name mismatches in data.json on GitHub
 * Usage: npx ts-node scripts/fix-engineer-names.ts
 */

import {
  readEngineerMasterListFromGitHub,
  readDataFromGitHub,
  writeDataToGitHub,
} from '../server/github';
import { findCanonicalEngineerName } from '../shared/utils/engineerNameUtils';

async function fixEngineerNames() {
  console.log('🔍 Starting engineer name migration...');
  console.log('📡 Reading data from GitHub...');

  try {
    // 1. Fetch both data sources in parallel
    const [masterData, rawData] = await Promise.all([
      readEngineerMasterListFromGitHub(),
      readDataFromGitHub()
    ]);

    if (!masterData.engineers || masterData.engineers.length === 0) {
      console.error('❌ Master list is empty. Cannot proceed.');
      return;
    }

    if (!rawData.engineerDailyData || rawData.engineerDailyData.length === 0) {
      console.log('ℹ️ No daily activity data found. Nothing to migrate.');
      return;
    }

    console.log(`📊 Found ${masterData.engineers.length} engineers in master list`);
    console.log(`📊 Found ${rawData.engineerDailyData.length} daily activity entries`);

    // 2. Process and fix names
    let fixedCount = 0;
    const changes: Array<{ old: string; new: string; entryDate: string }> = [];
    const warnings: string[] = [];

    const fixedData = rawData.engineerDailyData.map(entry => {
      const originalName = entry.engineerName;
      if (!originalName) return entry;

      const canonical = findCanonicalEngineerName(originalName, masterData.engineers);

      if (canonical && canonical !== originalName) {
        fixedCount++;
        changes.push({
          old: originalName,
          new: canonical,
          entryDate: entry.date
        });
        return { ...entry, engineerName: canonical };
      } else if (!canonical) {
        warnings.push(`⚠️ No match found for: "${originalName}" (Date: ${entry.date})`);
      }

      return entry;
    });

    // 3. Report results
    console.log('\n📝 Migration Results:');
    console.log(`✅ Successfully fixed: ${fixedCount} entries`);
    
    if (changes.length > 0) {
      console.log('\n🔄 Changes applied:');
      changes.forEach(c => {
        console.log(`  • "${c.old}" → "${c.new}" [${c.entryDate}]`);
      });
    }

    if (warnings.length > 0) {
      console.log('\n⚠️ Warnings (unmatched names - review manually):');
      warnings.forEach(w => console.log(`  ${w}`));
    }

    if (fixedCount === 0) {
      console.log('\n✨ No fixes needed. All names already match the master list.');
      return;
    }

    // 4. Write back to GitHub
    console.log('\n💾 Writing corrected data to GitHub...');
    const success = await writeDataToGitHub({
      engineerDailyData: fixedData
    });

    if (success) {
      console.log('🎉 Migration complete! Changes saved to GitHub.');
      console.log('🔁 Refresh your app to see updated engineer names.');
    } else {
      console.error('❌ Failed to save changes to GitHub. Check server logs.');
    }

  } catch (error) {
    console.error('❌ Migration failed with error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  fixEngineerNames().catch(console.error);
}

export { fixEngineerNames };
