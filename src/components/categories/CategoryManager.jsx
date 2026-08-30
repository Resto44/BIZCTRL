/**
 * Enterprise Category Manager
 * - Tree view with expand/collapse (3 levels)
 * - Drag & Drop sorting
 * - Search & Filter
 * - Color Picker, Icon Picker, Image Upload
 * - Works for: product_categories, expense_categories,
 *              sales_categories, online_order_categories
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown,
  Search, GripVertical, X, Check, FolderOpen,
  Layers, DollarSign, TrendingUp, Globe,
} from 'lucide-react';
import { NewIconPicker } from './NewIconPicker';
import { CategoryIcon } from '@/components/shared/CategoryIcon';
import { toast } from 'sonner';

// ── Module config ─────────────────────────────────────────────────────────────
export const CATEGORY_MODULES = {
  product: {
    key: 'product',
    label: 'Product Categories',
    table: 'product_categories',
    entity: 'ProductCategory',
    queryKey: 'product_categories',
    icon: Layers,
    color: '#3B82F6',
    defaultIcon: '📦',
    hierarchical: true,
    description: 'Used by Product Management & Inventory only',
  },
  expense: {
    key: 'expense',
    label: 'Expense Categories',
    table: 'expense_categories',
    entity: 'ExpenseCategory',
    queryKey: 'expense_categories',
    icon: DollarSign,
    color: '#EF4444',
    defaultIcon: '💸',
    hierarchical: false,
    description: 'Used by Expenses module only',
  },

  sales: {
    key: 'sales',
    label: 'Sales Categories',
    table: 'sales_categories',
    entity: 'SalesCategory',
    queryKey: 'sales_categories',
    icon: TrendingUp,
    color: '#10B981',
    defaultIcon: '💰',
    hierarchical: false,
    description: 'Used by Sales module only',
  },
  online_order: {
    key: 'online_order',
    label: 'Online Order Categories',
    table: 'online_order_categories',
    entity: 'OnlineOrderCategory',
    queryKey: 'online_order_categories',
    icon: Globe,
    color: '#F59E0B',
    defaultIcon: '🍽',
    hierarchical: false,
    description: 'Used by Online Ordering module only',
  },
};

// ── Common icon palette ───────────────────────────────────────────────────────
const ICON_PALETTE = [
  '📦','🍽','🍗','🍚','🥩','🥗','🍕','🍔','🌮','🌯','🥙','🍱','🍜','🍝','🥘',
  '🍲','🥣','🥧','🧁','🍰','🎂','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🧃','🥤',
  '☕','🍵','🧋','🍺','🍻','🥂','🍷','🍸','🍹','🧊','💧','🥛','🍶','🫖',
  '🛒','💸','💰','💳','🏷','📊','📈','📉','🔖','🗂','📁','📂','🗃','🗄',
  '🥦','🥕','🧅','🧄','🫑','🌽','🍅','🥑','🍋','🍊','🍎','🍇','🍓','🫐',
  '🐔','🐄','🐟','🦐','🦑','🥚','🧀','🥓','🌾','🫘','🥜','🌿','🌱','🍀',
  '🍾','🥃','🍦','🧇','🥞','🧆','🥙','🌭','🍟','🍿','🥨','🥐','🍞','🫓',
  '📦','🏪','🏬','🏭','🚚','✈','🚢','🚁','🛵','🚲','🛺','🏠','🏢','🏗',
  '💊','🩺','🔬','🧪','🔭','🛠','⚙','🔧','🔩','🪛','🔨','🪚','🗜','⛏',
  '🎯','🎮','🎲','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎸','🎺','🎻',
];

// ── Color palette ─────────────────────────────────────────────────────────────
const COLOR_PALETTE = [
  '#EF4444','#F97316','#F59E0B','#EAB308','#84CC16','#22C55E','#10B981',
  '#14B8A6','#06B6D4','#3B82F6','#6366F1','#8B5CF6','#A855F7','#EC4899',
  '#F43F5E','#64748B','#374151','#1E293B','#0F172A','#FFFFFF',
];

// ── Hooks ─────────────────────────────────────────────────────────────────────
export function useCategoryModule(moduleKey) {
  const mod = CATEGORY_MODULES[moduleKey];
  const { activeRestaurantId } = useTenant();
  const qc = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: [mod.queryKey, activeRestaurantId],
    queryFn: () => base44.entities[mod.entity].filter(
      activeRestaurantId ? { restaurant_id: activeRestaurantId } : {},
      'sort_order',
      500
    ),
    enabled: !!mod.entity,
  });

  const createMut = useMutation({
    mutationFn: (data) => base44.entities[mod.entity].create({
      ...data,
      restaurant_id: activeRestaurantId,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [mod.queryKey] });
      toast.success('Category created');
    },
    onError: (e) => toast.error('Failed to create: ' + e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities[mod.entity].update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [mod.queryKey] });
      toast.success('Category updated');
    },
    onError: (e) => toast.error('Failed to update: ' + e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities[mod.entity].delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [mod.queryKey] });
      toast.success('Category deleted');
    },
    onError: (e) => toast.error('Failed to delete: ' + e.message),
  });

  const reorderMut = useMutation({
    mutationFn: async (orderedIds) => {
      await Promise.all(
        orderedIds.map((id, idx) => base44.entities[mod.entity].update(id, { sort_order: idx }))
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [mod.queryKey] }),
  });

  return { categories, isLoading, createMut, updateMut, deleteMut, reorderMut, mod };
}

// ── Color Picker ──────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const content = (
    <div className={isMobile ? "p-4" : "p-3 w-56"}>
      <div className="grid grid-cols-10 gap-1 mb-2">
        {COLOR_PALETTE.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => { onChange(c); setOpen(false); }}
            className="w-5 h-5 sm:w-4 sm:h-4 rounded-full border border-border hover:scale-125 transition-transform"
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Label className="text-xs text-muted-foreground">Custom:</Label>
        <input
          type="color"
          value={value || '#3B82F6'}
          onChange={e => onChange(e.target.value)}
          className="w-8 h-6 rounded cursor-pointer border-0"
        />
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
      </div>
      <Button size="sm" variant="ghost" className="w-full mt-2 text-xs" onClick={() => setOpen(false)}>
        <Check className="w-3 h-3 mr-1" /> Done
      </Button>
    </div>
  );

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="w-8 h-8 rounded-full border-2 border-border shadow-sm hover:scale-110 transition-transform"
      style={{ background: value || '#3B82F6' }}
      title="Pick color"
    />
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-xl max-h-[70vh] p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="text-sm">Select Color</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto">
              {content}
            </div>
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
      <PopoverContent className="w-auto p-0" align="center">
        {content}
      </PopoverContent>
    </Popover>
  );
}

// ── Category Form ─────────────────────────────────────────────────────────────
function CategoryForm({ initial, parentOptions, onSubmit, onCancel, mod, isLoading }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    name_ar: initial?.name_ar || '',
    name_fa: initial?.name_fa || '',
    color: initial?.color || mod.color,
    icon: initial?.icon || mod.defaultIcon,
    image_url: initial?.image_url || '',
    parent_id: initial?.parent_id || '',
    sort_order: initial?.sort_order ?? 0,
    is_active: initial?.is_active ?? true,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const payload = {
      name: form.name.trim(),
      name_ar: form.name_ar || null,
      name_fa: form.name_fa || null,
      color: form.color,
      icon: form.icon,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    if (mod.hierarchical) payload.parent_id = form.parent_id || null;
    if ('image_url' in form) payload.image_url = form.image_url || null;
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name row with color + icon */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs font-medium">Name (English) *</Label>
          <Input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Category name"
            className="h-9 mt-1"
            autoFocus
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <Label className="text-xs font-medium">Color</Label>
          <ColorPicker value={form.color} onChange={v => set('color', v)} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <Label className="text-xs font-medium">Icon</Label>
          <NewIconPicker value={form.icon} onChange={v => set('icon', v)} color={form.color} />
        </div>
      </div>

      {/* Arabic & Farsi */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">Arabic (اسم)</Label>
          <Input
            value={form.name_ar}
            onChange={e => set('name_ar', e.target.value)}
            placeholder="الاسم بالعربية"
            dir="rtl"
            className="h-9 mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-medium">Farsi (نام)</Label>
          <Input
            value={form.name_fa}
            onChange={e => set('name_fa', e.target.value)}
            placeholder="نام فارسی"
            dir="rtl"
            className="h-9 mt-1"
          />
        </div>
      </div>

      {/* Parent category (hierarchical only) */}
      {mod.hierarchical && parentOptions && parentOptions.length > 0 && (
        <div>
          <Label className="text-xs font-medium">Parent Category (leave blank for Level 1)</Label>
          <select
            value={form.parent_id}
            onChange={e => set('parent_id', e.target.value)}
            className="w-full h-9 mt-1 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Top Level (Main Category) —</option>
            {parentOptions.map(p => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
                {p.parent_id ? ' (Sub)' : ' (Main)'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Image URL */}
      <div>
        <Label className="text-xs font-medium">Image URL (optional)</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={form.image_url}
            onChange={e => set('image_url', e.target.value)}
            placeholder="https://..."
            className="h-9 flex-1"
          />
          {form.image_url && (
            <img
              src={form.image_url}
              alt="preview"
              className="w-9 h-9 rounded-md object-cover border border-border"
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}
        </div>
      </div>

      {/* Sort order & Active */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label className="text-xs font-medium">Sort Order</Label>
          <Input
            type="number"
            value={form.sort_order}
            onChange={e => set('sort_order', e.target.value)}
            className="h-9 mt-1 w-24"
            min={0}
          />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Switch
            checked={form.is_active}
            onCheckedChange={v => set('is_active', v)}
            id="cat-active"
          />
          <Label htmlFor="cat-active" className="text-sm cursor-pointer">Active</Label>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : (initial ? 'Save Changes' : 'Add Category')}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Tree Node ─────────────────────────────────────────────────────────────────
function CategoryTreeNode({
  node, level, allCategories, onEdit, onDelete, onAddChild,
  dragState, onDragStart, onDragOver, onDrop, mod,
}) {
  const [expanded, setExpanded] = useState(level < 2);
  const children = allCategories.filter(c => c.parent_id === node.id);
  const hasChildren = children.length > 0;
  const indent = level * 20;

  return (
    <div>
      <div
        draggable
        onDragStart={() => onDragStart(node)}
        onDragOver={e => { e.preventDefault(); onDragOver(node); }}
        onDrop={() => onDrop(node)}
        className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing
          ${dragState?.over?.id === node.id ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-transparent hover:border-border hover:bg-muted/50'}
          ${!node.is_active ? 'opacity-50' : ''}
        `}
        style={{ marginLeft: indent }}
      >
        {/* Drag handle */}
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`w-4 h-4 shrink-0 transition-transform ${!hasChildren ? 'invisible' : ''}`}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {/* Color dot */}
        <span
          className="w-3 h-3 rounded-full shrink-0 border border-white/20 shadow-sm"
          style={{ background: node.color || mod.color }}
        />

        {/* Icon */}
        <CategoryIcon icon={node.icon || mod.defaultIcon} color={node.color || mod.color} className="w-4 h-4 shrink-0" />

        {/* Image thumbnail */}
        {node.image_url && (
          <img
            src={node.image_url}
            alt=""
            className="w-6 h-6 rounded object-cover shrink-0"
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}

        {/* Name */}
        <span className="flex-1 text-sm font-medium truncate">{node.name}</span>

        {/* Level badge */}
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 shrink-0">
          L{level + 1}
        </Badge>

        {/* Arabic name */}
        {node.name_ar && (
          <span className="text-xs text-muted-foreground font-arabic shrink-0 max-w-[80px] truncate" dir="rtl">
            {node.name_ar}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {mod.hierarchical && level < 2 && (
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-primary"
              title="Add child category"
              onClick={() => onAddChild(node)}
            >
              <Plus className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(node)}
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(node)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {children
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
            .map(child => (
              <CategoryTreeNode
                key={child.id}
                node={child}
                level={level + 1}
                allCategories={allCategories}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddChild={onAddChild}
                dragState={dragState}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                mod={mod}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ── Flat Category Row (for non-hierarchical modules) ──────────────────────────
function CategoryFlatRow({ node, onEdit, onDelete, dragState, onDragStart, onDragOver, onDrop, mod }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(node)}
      onDragOver={e => { e.preventDefault(); onDragOver(node); }}
      onDrop={() => onDrop(node)}
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing
        ${dragState?.over?.id === node.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50 bg-card'}
        ${!node.is_active ? 'opacity-50' : ''}
      `}
    >
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: node.color || mod.color }} />
      <CategoryIcon icon={node.icon || mod.defaultIcon} color={node.color || mod.color} className="w-4 h-4 shrink-0" />
      {node.image_url && (
        <img src={node.image_url} alt="" className="w-6 h-6 rounded object-cover shrink-0"
          onError={e => { e.target.style.display = 'none'; }} />
      )}
      <span className="flex-1 text-sm font-medium">{node.name}</span>
      {node.name_ar && (
        <span className="text-xs text-muted-foreground shrink-0" dir="rtl">{node.name_ar}</span>
      )}
      {!node.is_active && (
        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">Inactive</Badge>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(node)}>
          <Pencil className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(node)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Module Panel ──────────────────────────────────────────────────────────────
function CategoryModulePanel({ moduleKey }) {
  const { categories, isLoading, createMut, updateMut, deleteMut, reorderMut, mod } = useCategoryModule(moduleKey);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all'); // 'all' | 'active' | 'inactive'
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [addChildOf, setAddChildOf] = useState(null); // parent node for child creation
  const [dragState, setDragState] = useState({ dragging: null, over: null });

  // Filtered categories
  const filtered = useMemo(() => {
    let cats = categories;
    if (search) {
      const q = search.toLowerCase();
      cats = cats.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.name_ar?.toLowerCase().includes(q) ||
        c.name_fa?.toLowerCase().includes(q)
      );
    }
    if (filterActive === 'active') cats = cats.filter(c => c.is_active);
    if (filterActive === 'inactive') cats = cats.filter(c => !c.is_active);
    return cats;
  }, [categories, search, filterActive]);

  // Root nodes (no parent)
  const rootNodes = useMemo(() =>
    filtered.filter(c => !c.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [filtered]
  );

  // All non-root nodes (for parent picker in form)
  const nonRootNodes = useMemo(() =>
    categories.filter(c => !c.parent_id),
    [categories]
  );

  // Drag & Drop handlers
  const handleDragStart = useCallback((node) => {
    setDragState(s => ({ ...s, dragging: node }));
  }, []);

  const handleDragOver = useCallback((node) => {
    setDragState(s => ({ ...s, over: node }));
  }, []);

  const handleDrop = useCallback((targetNode) => {
    const { dragging } = dragState;
    if (!dragging || dragging.id === targetNode.id) {
      setDragState({ dragging: null, over: null });
      return;
    }
    // Reorder within same parent level
    const siblings = categories
      .filter(c => c.parent_id === targetNode.parent_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const fromIdx = siblings.findIndex(c => c.id === dragging.id);
    const toIdx = siblings.findIndex(c => c.id === targetNode.id);
    if (fromIdx === -1 || toIdx === -1) {
      setDragState({ dragging: null, over: null });
      return;
    }
    const reordered = [...siblings];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    reorderMut.mutate(reordered.map(c => c.id));
    setDragState({ dragging: null, over: null });
  }, [dragState, categories, reorderMut]);

  const handleCreate = (data) => {
    if (addChildOf) data.parent_id = addChildOf.id;
    createMut.mutate(data, {
      onSuccess: () => {
        setShowForm(false);
        setAddChildOf(null);
      },
    });
  };

  const handleUpdate = (data) => {
    updateMut.mutate({ id: editing.id, data }, {
      onSuccess: () => setEditing(null),
    });
  };

  const handleAddChild = (parentNode) => {
    setAddChildOf(parentNode);
    setShowForm(true);
  };

  const ModIcon = mod.icon;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: mod.color + '20' }}>
            <ModIcon className="w-4 h-4" style={{ color: mod.color }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{mod.label}</h3>
            <p className="text-[10px] text-muted-foreground">{mod.description}</p>
          </div>
          <Badge variant="secondary" className="text-xs">{categories.length}</Badge>
        </div>
        <Button size="sm" onClick={() => { setShowForm(true); setAddChildOf(null); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Category
        </Button>
      </div>

      {/* Search & Filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search categories..."
            className="h-8 pl-8 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {['all', 'active', 'inactive'].map(f => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              className={`px-2.5 py-1.5 capitalize transition-colors ${filterActive === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Category list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading categories...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-xl">
          <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-muted-foreground">
            {search ? 'No categories match your search' : 'No categories yet'}
          </p>
          {!search && (
            <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Create First Category
            </Button>
          )}
        </div>
      ) : (
        <div
          className="space-y-0.5"
          onDragEnd={() => setDragState({ dragging: null, over: null })}
        >
          {mod.hierarchical ? (
            rootNodes.map(node => (
              <CategoryTreeNode
                key={node.id}
                node={node}
                level={0}
                allCategories={filtered}
                onEdit={setEditing}
                onDelete={setDeleting}
                onAddChild={handleAddChild}
                dragState={dragState}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                mod={mod}
              />
            ))
          ) : (
            filtered
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map(node => (
                <CategoryFlatRow
                  key={node.id}
                  node={node}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                  dragState={dragState}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  mod={mod}
                />
              ))
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setAddChildOf(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {addChildOf
                ? `Add Sub-category under "${addChildOf.name}"`
                : `Add ${mod.label.replace(' Categories', ' Category')}`
              }
            </DialogTitle>
          </DialogHeader>
          <CategoryForm
            parentOptions={mod.hierarchical ? nonRootNodes : null}
            onSubmit={handleCreate}
            onCancel={() => { setShowForm(false); setAddChildOf(null); }}
            mod={mod}
            isLoading={createMut.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {editing && (
            <CategoryForm
              initial={editing}
              parentOptions={mod.hierarchical ? nonRootNodes.filter(c => c.id !== editing.id) : null}
              onSubmit={handleUpdate}
              onCancel={() => setEditing(null)}
              mod={mod}
              isLoading={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>"{deleting?.name}"</strong>?
              {mod.hierarchical && ' All child categories will also be deleted.'}
              {' '}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { deleteMut.mutate(deleting.id); setDeleting(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main Category Manager Page ────────────────────────────────────────────────
export default function CategoryManager() {
  const [activeModule, setActiveModule] = useState('product');

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Enterprise Category Manager</h1>
          <p className="text-sm text-muted-foreground">
            Manage all category modules — fully isolated, no cross-contamination
          </p>
        </div>
      </div>

      {/* Module tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl overflow-x-auto">
        {Object.values(CATEGORY_MODULES).map(mod => {
          const Icon = mod.icon;
          return (
            <button
              key={mod.key}
              onClick={() => setActiveModule(mod.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                ${activeModule === mod.key
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: activeModule === mod.key ? mod.color : undefined }} />
              {mod.label.replace(' Categories', '')}
            </button>
          );
        })}
      </div>

      {/* Active module panel */}
      <div className="bg-card border border-border rounded-xl p-4">
        <CategoryModulePanel key={activeModule} moduleKey={activeModule} />
      </div>
    </div>
  );
}

// useCategoryModule is already exported above with 'export function useCategoryModule'
