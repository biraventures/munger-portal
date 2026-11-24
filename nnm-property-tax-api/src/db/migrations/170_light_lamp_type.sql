-- Type of streetlight fitting. Existing lights (and any added without a choice, e.g. by CSV) are LED panel lights - tall.
ALTER TABLE lights ADD COLUMN IF NOT EXISTS lamp_type VARCHAR(32) NOT NULL DEFAULT 'led_panel_tall';
ALTER TABLE lights DROP CONSTRAINT IF EXISTS lights_lamp_type_check;
ALTER TABLE lights ADD CONSTRAINT lights_lamp_type_check
  CHECK (lamp_type IN ('globe', 'led_strip', 'halogen', 'led_panel_short', 'led_panel_tall'));
