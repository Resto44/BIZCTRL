import React, { useState, useMemo, useEffect } from 'react';
import { Search, Star, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { ENTERPRISE_ICONS, ICON_CATEGORIES } from './IconCatalog';
import { iconComponentFor } from './EnterpriseIconRegistry';

// Storage key for frequently used icons
const FREQUENT_ICONS_KEY = 'resto_frequent_icons';

export function NewIconPicker({ value, onChange, color }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('restaurant');
  const [frequentIcons, setFrequentIcons] = useState([]);
  const isMobile = useIsMobile();

  // Load frequent icons from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(FREQUENT_ICONS_KEY);
    if (stored) {
      try {
        setFrequentIcons(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse frequent icons', e);
      }
    }
  }, []);

  const handleIconSelect = (iconName) => {
    onChange(iconName);
    setOpen(false);
    setSearch('');

    // Update frequent icons
    const updated = [iconName, ...frequentIcons.filter(i => i !== iconName)].slice(0, 10);
    setFrequentIcons(updated);
    localStorage.setItem(FREQUENT_ICONS_KEY, JSON.stringify(updated));
  };

  const filteredIcons = useMemo(() => {
    if (!search) return ENTERPRISE_ICONS;
    const q = search.toLowerCase();
    return ENTERPRISE_ICONS.filter(icon => 
      icon.name.toLowerCase().includes(q) ||
      icon.labels.en.some(l => l.toLowerCase().includes(q)) ||
      icon.labels.ar.some(l => l.includes(q)) ||
      icon.labels.fa.some(l => l.includes(q))
    );
  }, [search]);

  const iconsByTab = useMemo(() => {
    const groups = {};
    ICON_CATEGORIES.forEach(cat => {
      groups[cat.id] = filteredIcons.filter(i => i.category === cat.id);
    });
    return groups;
  }, [filteredIcons]);

  const renderIconGrid = (icons) => (
    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2 p-1">
      {icons.map((icon) => {
        const IconComponent = iconComponentFor(icon.name);
        const isSelected = value === icon.name;
        
        return (
          <button
            key={icon.name}
            type="button"
            onClick={() => handleIconSelect(icon.name)}
            className={`
              flex flex-col items-center justify-center p-2 rounded-lg border transition-all
              hover:bg-accent hover:border-primary/50 group
              ${isSelected ? 'bg-primary/10 border-primary ring-1 ring-primary' : 'border-transparent bg-muted/30'}
            `}
            title={icon.labels.en.join(', ')}
          >
            <IconComponent 
              className="w-6 h-6 transition-transform group-hover:scale-110" 
              style={{ color: isSelected ? color : 'inherit' }}
            />
            <span className="text-[10px] mt-1 truncate w-full text-center opacity-70 group-hover:opacity-100">
              {icon.labels.en[0]}
            </span>
          </button>
        );
      })}
    </div>
  );

  const content = (
    <div className={`flex flex-col ${isMobile ? 'h-[80vh]' : 'w-[450px] h-[500px]'}`}>
      <div className="p-4 border-b space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search icons (English, Arabic, Persian)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-9"
            autoFocus
          />
          {search && (
            <button 
              onClick={() => setSearch('')} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {frequentIcons.length > 0 && !search && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground shrink-0 mr-1">
              <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
              Recent:
            </div>
            {frequentIcons.map(name => {
              const IconComp = iconComponentFor(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleIconSelect(name)}
                  className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 hover:bg-accent ${value === name ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                >
                  <IconComp className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {search ? (
          <div className="flex-1 overflow-y-auto p-4">
            {filteredIcons.length > 0 ? (
              renderIconGrid(filteredIcons)
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No icons found for "{search}"</p>
              </div>
            )}
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 border-b bg-muted/20">
              <TabsList className="w-full justify-start h-10 bg-transparent gap-4 overflow-x-auto no-scrollbar">
                {ICON_CATEGORIES.map(cat => (
                  <TabsTrigger 
                    key={cat.id} 
                    value={cat.id}
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 h-10 text-xs"
                  >
                    {cat.label.en}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {ICON_CATEGORIES.map(cat => (
              <TabsContent key={cat.id} value={cat.id} className="flex-1 overflow-hidden m-0 p-0">
                <div className="h-full overflow-y-auto p-4">
                  {renderIconGrid(iconsByTab[cat.id])}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
      
      {!isMobile && (
        <div className="p-3 border-t bg-muted/10 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );

  const CurrentIcon = LucideIcons[value] || LucideIcons.HelpCircle;
  const isEmoji = !LucideIcons[value] && typeof value === 'string' && value.length <= 2;

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="w-10 h-10 rounded-lg border-2 border-border bg-card hover:border-primary hover:bg-accent flex items-center justify-center transition-all group relative overflow-hidden shadow-sm"
      title="Select Icon"
    >
      {isEmoji ? (
        <span className="text-xl">{value || '📦'}</span>
      ) : (
        <CurrentIcon className="w-6 h-6" style={{ color: color || 'inherit' }} />
      )}
      <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary text-white flex items-center justify-center rounded-tl-sm opacity-0 group-hover:opacity-100 transition-opacity">
        <Search className="w-2 h-2" />
      </div>
    </button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl p-0 h-[85vh]">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="text-lg font-bold">Select Icon</SheetTitle>
            </SheetHeader>
            {content}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 shadow-2xl border-primary/20" align="start" side="bottom">
        {content}
      </PopoverContent>
    </Popover>
  );
}
