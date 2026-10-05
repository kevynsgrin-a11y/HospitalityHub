-- Metro registry seed: test / launch / measurement_only tiers.
-- publishable=0 everywhere at seed time; flipping test/launch metros to 1 is an operator action
-- gated by the Batch 4 quality gates and Batch 5 thin-content guard.

INSERT INTO metros (slug, display_name, state, tier, bbox_lat_min, bbox_lat_max, bbox_lng_min, bbox_lng_max, cities_json, publishable) VALUES
  ('san-diego', 'San Diego', 'CA', 'test', 32.53, 33.27, -117.32, -116.90, '["San Diego"]', 0),
  ('los-angeles', 'Los Angeles', 'CA', 'launch', 33.70, 34.35, -118.67, -117.65, '["Los Angeles"]', 0),
  ('sf-bay-area', 'San Francisco Bay Area', 'CA', 'launch', 37.20, 38.05, -122.55, -121.70, '["San Francisco","Oakland","San Jose"]', 0),
  ('sacramento', 'Sacramento', 'CA', 'launch', 38.40, 38.75, -121.60, -121.20, '["Sacramento"]', 0),
  ('las-vegas', 'Las Vegas', 'NV', 'launch', 35.95, 36.35, -115.35, -114.90, '["Las Vegas"]', 0),
  ('new-york-city', 'New York City', 'NY', 'launch', 40.49, 40.92, -74.26, -73.70, '["New York"]', 0),
  ('miami', 'Miami', 'FL', 'launch', 25.55, 25.95, -80.45, -80.10, '["Miami"]', 0),
  ('seattle', 'Seattle', 'WA', 'launch', 47.40, 47.78, -122.45, -122.20, '["Seattle"]', 0),
  ('nashville', 'Nashville', 'TN', 'launch', 35.98, 36.32, -87.05, -86.55, '["Nashville"]', 0),
  ('california-statewide', 'California (measurement only)', 'CA', 'measurement_only', 32.53, 42.01, -124.42, -114.13, '[]', 0);

-- Source registry seed. Precedence: first-party ATS (1) > niche board (2) > general aggregator (3).
INSERT INTO sources (id, display_name, kind, precedence, license_terms_ref, robots_status, enabled) VALUES
  ('techmap', 'Techmap Jobs API (jobdatafeeds.com)', 'general_aggregator', 3, 'docs/LICENSING.md#techmap', 'n/a (licensed API)', 1),
  ('fantastic-jobs', 'Fantastic.jobs API', 'general_aggregator', 3, 'docs/LICENSING.md#fantasticjobs', 'n/a (licensed API)', 0),
  ('culinary-agents', 'Culinary Agents', 'niche_board', 2, 'probe/LAYERB.md', 'permitted (checked 2026-08-20)', 0),
  ('poached', 'Poached Jobs', 'niche_board', 2, 'probe/LAYERB.md', 'permitted (checked 2026-08-20)', 0),
  ('harri', 'Harri', 'first_party_ats', 1, 'probe/LAYERB.md', 'permitted (checked 2026-08-20)', 0),
  ('workstream', 'Workstream', 'first_party_ats', 1, 'probe/LAYERB.md', 'permitted (checked 2026-08-20)', 0);
