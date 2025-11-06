const fs = require('fs');
const path = require('path');

const jsonOutput = path.resolve(__dirname, '../docs/swagger.json');
const yamlOutput = path.resolve(__dirname, '../docs/swagger.yaml');

try {
  const specs = require('../config/swagger.config');

  fs.mkdirSync(path.dirname(jsonOutput), { recursive: true });
  fs.writeFileSync(jsonOutput, JSON.stringify(specs, null, 2));
  console.log(`Swagger JSON generated at ${jsonOutput}`);

  try {
    const yaml = require('yaml');
    fs.writeFileSync(yamlOutput, yaml.stringify(specs));
    console.log(`Swagger YAML generated at ${yamlOutput}`);
  } catch (yamlErr) {
    console.warn('YAML output skipped (yaml module not installed).');
  }
} catch (error) {
  console.error('Failed to generate Swagger documentation:', error.message);
  process.exitCode = 1;
}
