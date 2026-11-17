import { indexCuratedVectors } from './modules/policy/policy.controller';
indexCuratedVectors()
  .then(count => { console.log(`Indexed ${count} policy passages.`); process.exit(0); })
  .catch(error => { console.error(error.message); process.exit(1); });
