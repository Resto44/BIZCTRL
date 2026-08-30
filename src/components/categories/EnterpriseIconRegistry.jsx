import {
  AlertTriangle, Apple, Archive, ArrowLeftRight, Baby, Banknote, BarChart3,
  Barcode, Beef, Bell, BookOpen, Bookmark, Box, Building, Building2, Cake,
  Calendar, Candy, ChefHat, Clock, Coffee, Columns, Component, CookingPot,
  CreditCard, Croissant, CupSoda, DollarSign, Dog, Download, Drumstick, Egg,
  Factory, FileBarChart, FileText, Fish, Flame, Folder, Gamepad, GitBranch,
  GlassWater, Grid, Ham, Hammer, HandCoins, Heart, HelpCircle, Home, IceCream,
  Landmark, Layers, LayoutDashboard, Leaf, LeafyGreen, Milk, Package, Pencil,
  Percent, Pill, Pizza, QrCode, Receipt, Salad, Sandwich, Settings, Settings2,
  Shirt, ShoppingBag, ShoppingCart, Smartphone, Snowflake, Soup, Sparkles,
  Table, Tag, TrendingDown, TrendingUp, Truck, Upload, User, Users, Utensils,
  Wallet, Warehouse, XCircle,
} from 'lucide-react';

// The ERP category editor intentionally supports this curated icon set. Keeping
// the registry explicit preserves tree-shaking and avoids bundling all of Lucide.
export const ENTERPRISE_ICON_COMPONENTS = {
  AlertTriangle, Apple, Archive, ArrowLeftRight, Baby, Banknote, BarChart3,
  Barcode, Beef, Bell, BookOpen, Bookmark, Box, Building, Building2, Cake,
  Calendar, Candy, ChefHat, Clock, Coffee, Columns, Component, CookingPot,
  CreditCard, Croissant, CupSoda, DollarSign, Dog, Download, Drumstick, Egg,
  Factory, FileBarChart, FileText, Fish, Flame, Folder, Gamepad, GitBranch,
  GlassWater, Grid, Ham, Hammer, HandCoins, Heart, Home, IceCream, Landmark,
  Layers, LayoutDashboard, Leaf, LeafyGreen, Milk, Package, Pencil, Percent,
  Pill, Pizza, QrCode, Receipt, Salad, Sandwich, Settings, Settings2, Shirt,
  ShoppingBag, ShoppingCart, Smartphone, Snowflake, Soup, Sparkles, Table,
  Tag, TrendingDown, TrendingUp, Truck, Upload, User, Users, Utensils, Wallet,
  Warehouse, XCircle,
};

export function iconComponentFor(name) {
  return ENTERPRISE_ICON_COMPONENTS[name] || HelpCircle;
}
