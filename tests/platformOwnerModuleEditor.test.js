import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const portalPath = new URL('../src/pages/PlatformOwnerPortal.jsx', import.meta.url);

describe('Platform Owner Modules editor', () => {
  it('opens an accessible Dialog from the Edit action with the selected module payload', async () => {
    const portal = await readFile(portalPath, 'utf8');

    expect(portal).toContain('const [editorOpen, setEditorOpen] = useState(false);');
    expect(portal).toContain('const openEdit = (module) => {');
    expect(portal).toContain('onClick={() => openEdit(module)}>Edit</Button>');
    expect(portal).toContain('<Dialog open={editorOpen} onOpenChange={(open) => { if (!open) closeEditor(); }}>');
    expect(portal).toContain('<DialogTitle>{editing ? \'Edit module\' : \'Add module\'}</DialogTitle>');
    expect(portal).toContain('max-h-[88dvh] max-w-lg overflow-y-auto');
  });

  it('keeps the editor open on a failed mutation and closes it only after an authorized save succeeds', async () => {
    const portal = await readFile(portalPath, 'utf8');

    expect(portal).toContain('onSave(form, { onSuccess: closeEditor });');
    expect(portal).toContain("onSave={(module, options) => mutation.mutate({ fn: platformOwnerApi.saveModule, args: [module] }, options)}");
    expect(portal).toContain('const closeEditor = () => {');
  });

  it('retains the global enable/disable action for each module card', async () => {
    const portal = await readFile(portalPath, 'utf8');

    expect(portal).toContain("{module.is_globally_enabled ? 'Disable globally' : 'Enable globally'}");
    expect(portal).toContain('enabled: !module.is_globally_enabled');
  });
});
