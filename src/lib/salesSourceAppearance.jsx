import {
  Banknote,
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  DollarSign,
  Gift,
  Globe,
  Package,
  PlusCircle,
  ShoppingBag,
  Smartphone,
  Star,
  Shield,
  Truck,
  UserCheck,
  Users,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';

export const SALES_SOURCE_ICON_OPTIONS = [
  { value: 'Banknote', label: 'Cash', Icon: Banknote },
  { value: 'CreditCard', label: 'Card', Icon: CreditCard },
  { value: 'UserCheck', label: 'Credit', Icon: UserCheck },
  { value: 'PlusCircle', label: 'Other', Icon: PlusCircle },
  { value: 'DollarSign', label: 'Income', Icon: DollarSign },
  { value: 'Truck', label: 'Delivery', Icon: Truck },
  { value: 'ShoppingBag', label: 'Orders', Icon: ShoppingBag },
  { value: 'Smartphone', label: 'Online', Icon: Smartphone },
  { value: 'Building2', label: 'Corporate', Icon: Building2 },
  { value: 'Users', label: 'Team', Icon: Users },
  { value: 'Package', label: 'Wholesale', Icon: Package },
  { value: 'UtensilsCrossed', label: 'Restaurant', Icon: UtensilsCrossed },
  { value: 'Gift', label: 'Promotion', Icon: Gift },
  { value: 'Globe', label: 'Marketplace', Icon: Globe },
  { value: 'Star', label: 'Premium', Icon: Star },
  { value: 'Zap', label: 'Express', Icon: Zap },
  { value: 'Activity', label: 'Activity', Icon: Activity },
  { value: 'BarChart3', label: 'Analytics', Icon: BarChart3 },
  { value: 'Shield', label: 'Protected', Icon: Shield },
];

export const SALES_SOURCE_COLOR_OPTIONS = [
  { value: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500', soft: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', strongText: 'text-emerald-950' },
  { value: 'teal', label: 'Teal', swatch: 'bg-teal-500', soft: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', strongText: 'text-teal-950' },
  { value: 'blue', label: 'Blue', swatch: 'bg-blue-500', soft: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', strongText: 'text-blue-950' },
  { value: 'violet', label: 'Violet', swatch: 'bg-violet-500', soft: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', strongText: 'text-violet-950' },
  { value: 'amber', label: 'Amber', swatch: 'bg-amber-500', soft: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', strongText: 'text-amber-950' },
  { value: 'rose', label: 'Rose', swatch: 'bg-rose-500', soft: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', strongText: 'text-rose-950' },
  { value: 'slate', label: 'Slate', swatch: 'bg-slate-500', soft: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', strongText: 'text-slate-950' },
];

const iconByName = new Map(SALES_SOURCE_ICON_OPTIONS.map((option) => [option.value, option.Icon]));
const colorByName = new Map(SALES_SOURCE_COLOR_OPTIONS.map((option) => [option.value, option]));

export const salesSourceIconFor = (value) => iconByName.get(value) || Banknote;
export const salesSourceToneFor = (value) => colorByName.get(value) || SALES_SOURCE_COLOR_OPTIONS[0];
