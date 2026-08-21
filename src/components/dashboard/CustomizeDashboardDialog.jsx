import React, { useEffect, useMemo, useState } from 'react';
import { Settings2, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { getDashboardCustomizationCopy } from '@/lib/dashboardCustomization';

function buildDraft(widgets) {
  return widgets.reduce((draft, widget) => {
    draft[widget.id] = {
      title: widget.title,
      description: widget.description,
      isVisible: widget.isVisible,
    };
    return draft;
  }, {});
}

export default function CustomizeDashboardDialog({
  open,
  onOpenChange,
  widgets,
  lang,
  onSave,
  isSaving = false,
}) {
  const copy = useMemo(() => getDashboardCustomizationCopy(lang), [lang]);
  const [draft, setDraft] = useState(() => buildDraft(widgets));
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(buildDraft(widgets));
      setSaveError('');
    }
  }, [open, widgets]);

  const updateDraft = (widgetId, change) => {
    setDraft((current) => ({
      ...current,
      [widgetId]: { ...current[widgetId], ...change },
    }));
  };

  const resetWidget = (widget) => {
    // Reset in the open form immediately using the runtime default resolved by
    // the parent. Persistence occurs only after the owner saves the dialog.
    setDraft((current) => ({
      ...current,
      [widget.id]: {
        title: widget.defaultTitle,
        description: widget.defaultDescription,
        isVisible: true,
      },
    }));
  };

  const handleSave = async () => {
    const nextOverrides = widgets.reduce((result, widget) => {
      const value = draft[widget.id] || {};
      const override = {};
      if (value.title !== widget.defaultTitle) override.title = value.title;
      if (value.description !== widget.defaultDescription) override.description = value.description;
      if (widget.isOptional && value.isVisible === false) override.is_visible = false;
      if (Object.keys(override).length > 0) result[widget.id] = override;
      return result;
    }, {});
    try {
      setSaveError('');
      await onSave(nextOverrides);
      onOpenChange(false);
    } catch {
      setSaveError(copy.saveFailed);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0 sm:rounded-2xl">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Settings2 className="h-4 w-4" />
            </div>
            <DialogTitle>{copy.customizeDashboard}</DialogTitle>
          </div>
          <DialogDescription>{copy.customizeDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {widgets.map((widget) => {
            const value = draft[widget.id] || {};
            return (
              <section key={widget.id} className="rounded-xl border border-border/70 bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{widget.defaultTitle}</span>
                    <Badge variant="outline" className="text-[10px] font-medium">
                      {widget.isOptional ? copy.optional : copy.required}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    disabled={isSaving}
                    onClick={() => resetWidget(widget)}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {copy.resetWidget}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    {copy.widgetTitle}
                    <Input
                      value={value.title ?? ''}
                      onChange={(event) => updateDraft(widget.id, { title: event.target.value })}
                      disabled={isSaving}
                      aria-label={`${copy.widgetTitle}: ${widget.defaultTitle}`}
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    {copy.widgetDescription}
                    <Textarea
                      value={value.description ?? ''}
                      onChange={(event) => updateDraft(widget.id, { description: event.target.value })}
                      disabled={isSaving}
                      rows={2}
                      aria-label={`${copy.widgetDescription}: ${widget.defaultTitle}`}
                    />
                  </label>
                </div>

                {widget.isOptional && (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <span className="text-xs font-medium text-foreground">{copy.visible}</span>
                    <Switch
                      checked={value.isVisible !== false}
                      onCheckedChange={(isVisible) => updateDraft(widget.id, { isVisible })}
                      disabled={isSaving}
                      aria-label={`${copy.visible}: ${widget.defaultTitle}`}
                    />
                  </div>
                )}
              </section>
            );
          })}
          <p className="text-xs text-muted-foreground">{copy.resetHelp}</p>
          {saveError && <p role="alert" className="text-xs font-medium text-destructive">{saveError}</p>}
        </div>

        <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {copy.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || Object.values(draft).some((value) => value.title === '')}
          >
            {isSaving ? copy.saving : copy.saveChanges}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
