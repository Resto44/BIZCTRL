import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Building2, Mail, Package, FileText,
  CheckCircle2, ArrowLeft, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';

const PRODUCT_CATEGORIES = [
  'Fresh Produce', 'Meat & Poultry', 'Seafood', 'Dairy & Eggs',
  'Beverages', 'Dry Goods & Grains', 'Frozen Foods', 'Bakery & Pastry',
  'Cleaning Supplies', 'Packaging', 'Electronics', 'Pharmaceuticals',
  'Medical Supplies', 'Clothing & Textiles', 'Industrial Equipment',
  'Office Supplies', 'Construction Materials', 'Other',
];

export default function SupplierRegistration() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0=form, 1=success
  const [submitting, setSubmitting] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [form, setForm] = useState({
    supplier_name: '',
    contact_name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [errors, setErrors] = useState({});

  const toggleCategory = (cat) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const validate = () => {
    const errs = {};
    if (!form.supplier_name.trim()) errs.supplier_name = 'Company name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email address';
    if (!form.contact_name.trim()) errs.contact_name = 'Contact name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('supplier_invites')
        .insert({
          supplier_name: form.supplier_name.trim(),
          contact_name: form.contact_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          products: selectedCategories.join(', '),
          notes: form.notes.trim(),
          status: 'pending',
        });

      if (error) throw error;
      setStep(1);
    } catch (err) {
      console.error('[SupplierRegistration] error:', err);
      toast.error(err.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 1) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-3">Registration Submitted!</h1>
          <p className="text-slate-400 mb-2">
            Your supplier registration has been submitted successfully.
          </p>
          <p className="text-slate-400 mb-8 text-sm">
            A business owner will review your application and contact you at <span className="text-white font-medium">{form.email}</span> once approved.
          </p>
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => navigate('/auth')}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
            >
              Login to Your Account
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full border-white/20 text-slate-300 hover:bg-white/5"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-4xl mx-auto border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-black text-white">Biz<span className="text-cyan-400">CTRL</span></span>
            <p className="text-[10px] text-slate-500 -mt-0.5 uppercase tracking-wider">Supplier Registration</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-widest mb-4">
            <Building2 className="w-3 h-3" />
            <span>Supplier Portal</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-3">Register as a Supplier</h1>
          <p className="text-slate-400 max-w-md mx-auto">
            Submit your company details to connect with businesses on BizCTRL. Your application will be reviewed by business owners.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Company Information */}
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="w-5 h-5 text-amber-400" />
              <h2 className="text-white font-bold">Company Information</h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300 text-sm">Company / Business Name *</Label>
                <Input
                  className={`mt-1 bg-white/10 border-white/20 text-white placeholder:text-slate-500 ${errors.supplier_name ? 'border-red-500' : ''}`}
                  placeholder="e.g. Al-Nakheel Trading Co."
                  value={form.supplier_name}
                  onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                />
                {errors.supplier_name && <p className="text-red-400 text-xs mt-1">{errors.supplier_name}</p>}
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Contact Person Name *</Label>
                <Input
                  className={`mt-1 bg-white/10 border-white/20 text-white placeholder:text-slate-500 ${errors.contact_name ? 'border-red-500' : ''}`}
                  placeholder="Full name"
                  value={form.contact_name}
                  onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                />
                {errors.contact_name && <p className="text-red-400 text-xs mt-1">{errors.contact_name}</p>}
              </div>
            </div>
          </Card>

          {/* Contact Details */}
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-center gap-2 mb-5">
              <Mail className="w-5 h-5 text-cyan-400" />
              <h2 className="text-white font-bold">Contact Details</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300 text-sm">Email Address *</Label>
                <Input
                  type="email"
                  className={`mt-1 bg-white/10 border-white/20 text-white placeholder:text-slate-500 ${errors.email ? 'border-red-500' : ''}`}
                  placeholder="supplier@company.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Phone Number</Label>
                <Input
                  className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                  placeholder="+966 5x xxx xxxx"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
          </Card>

          {/* Product Categories */}
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-center gap-2 mb-5">
              <Package className="w-5 h-5 text-purple-400" />
              <h2 className="text-white font-bold">Product Categories</h2>
              <span className="text-xs text-slate-500">(select all that apply)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    selectedCategories.includes(cat)
                      ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                      : 'bg-white/5 border-white/20 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {selectedCategories.includes(cat) && '✓ '}{cat}
                </button>
              ))}
            </div>
          </Card>

          {/* Additional Notes */}
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-center gap-2 mb-5">
              <FileText className="w-5 h-5 text-emerald-400" />
              <h2 className="text-white font-bold">Additional Notes</h2>
            </div>
            <Textarea
              className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 min-h-[100px]"
              placeholder="Tell us about your company, products, minimum order quantities, delivery areas, etc."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </Card>

          {/* Submit */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/')}
              className="flex-1 border-white/20 text-slate-300 hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-white font-bold"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting…
                </span>
              ) : 'Submit Registration'}
            </Button>
          </div>

          <p className="text-center text-slate-600 text-xs">
            By submitting, you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>
      </div>
    </div>
  );
}
