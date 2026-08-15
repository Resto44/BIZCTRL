import { readFileSync, writeFileSync } from 'node:fs';

const filename = process.argv[2] || '20260815_platform_owner_control_plane.sql';
const query = readFileSync(`src/supabase/${filename}`, 'utf8');
writeFileSync('/tmp/platform-owner-control-plane-migration.json', JSON.stringify({
  project_id: 'mqubwgbppncldyiicbtu',
  name: filename.replace(/^\d+_/, '').replace(/\.sql$/, ''),
  query,
}, null, 2));
