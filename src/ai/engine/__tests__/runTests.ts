/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { runPhase1Tests } from './aiEnginePhase1.test';
import { runPhase2Tests } from './aiEnginePhase2.test';
import { runVaultTests } from '../../../utils/__tests__/vaultManager.test';

async function main() {
  console.log('🧪 Running Phase 1 Test Suite...');
  const res1 = await runPhase1Tests();
  res1.log.forEach(l => console.log(l));

  console.log('\n🧪 Running Phase 2 & 3 Test Suite...');
  const res2 = await runPhase2Tests();
  res2.log.forEach(l => console.log(l));

  console.log('\n🧪 Running Vault Storage Test Suite...');
  const res3 = await runVaultTests();
  res3.log.forEach(l => console.log(l));

  if (res1.success && res2.success && res3.success) {
    console.log('\n🎉 ALL PHASE 1, 2 & 3 ENGINE TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

main();
