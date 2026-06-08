#!/usr/bin/env node
import { runJackleWizard } from "../lib/wizard.mjs";

runJackleWizard(process.argv.slice(2)).catch((error) => {
  console.error(`jackle: ${error.message}`);
  process.exit(1);
});
