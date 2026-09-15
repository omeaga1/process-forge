-- ProcessForge Community UnitOp Library D1 Schema

-- Users table for community creators
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  provider TEXT NOT NULL,
  organization TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- UnitOp Plugins table
CREATE TABLE IF NOT EXISTS unitops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('PACKAGING', 'FLUID_PROCESSING', 'MATERIAL_HANDLING', 'QUALITY')),
  description TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  rating REAL NOT NULL DEFAULT 5.0,
  download_count INTEGER NOT NULL DEFAULT 0,
  asme_rating TEXT,
  tags TEXT,
  bundle_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- Indices for fast searching and filtering
CREATE INDEX IF NOT EXISTS idx_unitops_category ON unitops(category);
CREATE INDEX IF NOT EXISTS idx_unitops_author ON unitops(author_id);
CREATE INDEX IF NOT EXISTS idx_unitops_downloads ON unitops(download_count DESC);
CREATE INDEX IF NOT EXISTS idx_unitops_rating ON unitops(rating DESC);

-- Seed Initial Verified Community UnitOps
INSERT OR IGNORE INTO users (id, username, display_name, email, provider, organization)
VALUES 
  ('user-serac', 'oem_serac', 'Serac Systems OEM', 'engineering@serac.com', 'github', 'Serac Systems OEM'),
  ('user-coatingstech', 'coatingstech', 'CoatingsTech Labs', 'lab@coatingstech.io', 'google', 'CoatingsTech Labs'),
  ('user-packsys', 'packsys', 'PackSys Global', 'solutions@packsys.com', 'microsoft', 'PackSys Global');

INSERT OR IGNORE INTO unitops (
  id, name, author_id, author_name, category, description, version, rating, download_count, asme_rating, tags, bundle_json
) VALUES
(
  'plugin-serac-10-filler',
  'Serac 10-Nozzle Rotary Piston Filler',
  'user-serac',
  'OEM-Serac Systems',
  'PACKAGING',
  'High-speed rotary liquid filler with bottom-up dwell cams to eliminate latex paint foaming. Includes dedicated Serac OEM port contracts and nozzle dressing.',
  '1.0.0',
  4.9,
  1420,
  'ASME B31.3 Fluid Code Compliant',
  'filler,liquid,packaging,high-speed,rotary',
  '{"id":"node-imported-filler","name":"Serac 10-Nozzle Rotary Filler","kind":"ROTARY_FILLER","position":{"x":800,"y":350},"inputs":[{"id":"in-fluid","name":"Paint Infeed","type":"FLUID_INPUT","flowDimension":"CONTINUOUS_VOLUME"}],"outputs":[{"id":"out-cans","name":"Filled Containers","type":"DISCRETE_OUTPUT","flowDimension":"DISCRETE_CONTAINER"}],"config":{"nozzleCount":10,"containerVolumeGallons":1.0,"fillTimePerCycleSeconds":10.0,"indexTimePerCycleSeconds":1.8,"bufferQueueCapacity":60,"rejectRatePercentage":0.5},"assignedSubAgentId":"subagent-serac-filler"}'
),
(
  'plugin-high-shear-mixer',
  'High-Shear Pigment Dispersion Mixer',
  'user-coatingstech',
  'CoatingsTech Labs',
  'FLUID_PROCESSING',
  'Rotor-stator batch dispersion tank for acrylic emulsions and pigment milling. Models non-Newtonian thixotropic fluid breakdown.',
  '1.0.0',
  4.8,
  890,
  'ASME Sec VIII Div 1',
  'mixer,dispersion,fluid,batch,pigment',
  '{"id":"node-imported-mixer","name":"High-Shear Dispersion Mixer","kind":"BATCH_REACTOR","position":{"x":200,"y":350},"inputs":[],"outputs":[{"id":"out-fluid","name":"Slurry Discharge","type":"FLUID_OUTPUT","flowDimension":"CONTINUOUS_VOLUME"}],"config":{"batchVolumeGallons":500,"fillDurationMinutes":15,"reactionDurationMinutes":30,"dischargeRateGpm":40,"fluid":{"name":"Pigment Dispersion Base","densityGPerCm3":1.35,"viscosityCentipoise":2200,"temperatureCelsius":28}},"assignedSubAgentId":"subagent-high-shear-mixer"}'
),
(
  'plugin-case-packer',
  'PackSys Automatic 24-Can Case Packer',
  'user-packsys',
  'PackSys Global',
  'PACKAGING',
  'End-of-line case packing cell. Groups 24 one-gallon cans into corrugated trays with hot-melt glue sealing and queue telemetry.',
  '1.0.0',
  4.95,
  2150,
  'ASME B20.1 Conveyor Safety Standard',
  'packer,cartoner,packaging,can,discrete',
  '{"id":"node-imported-case-packer","name":"PackSys 24-Can Case Packer","kind":"PALLETIZER","position":{"x":1500,"y":350},"inputs":[{"id":"in-cans","name":"Cans Infeed","type":"DISCRETE_INPUT","flowDimension":"DISCRETE_CONTAINER"}],"outputs":[],"config":{"containersPerLayer":24,"layersPerSkid":1,"cycleSecondsPerLayer":32,"skidChangeoverSeconds":15},"assignedSubAgentId":"subagent-case-packer"}'
);
