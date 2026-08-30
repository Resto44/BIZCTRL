import React, { useEffect } from 'react';
import { useRole, ROLES } from '@/lib/RoleContext';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, ShoppingCart } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useNavigate } from 'react-router-dom';

export default function StaffUpload() {
  const { role } = useRole();
  const navigate = useNavigate();

  // Owners and restaurant_admins must never see this staff page — redirect to dashboard
  useEffect(() => {
    if (role === ROLES.OWNER || role === ROLES.RESTAURANT_ADMIN) {
      window.location.replace('/');
    }
  }, [navigate, role]);
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {t('Daily Operations')}
          </h1>
          <p className="text-slate-600">
            {t('Record your daily sales and purchases')}
          </p>
        </div>

        {/* Main Tiles */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Sales Tile */}
            <button
              type="button"
              onClick={() => navigate('/sales')}
              className="block w-full text-left"
            >
              <Card className="hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-primary">
                <CardContent className="p-8">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-primary/10 rounded-full">
                      <BarChart3 className="w-12 h-12 text-primary" />
                    </div>
                    <div className="text-center">
                      <h2 className="text-2xl font-bold text-slate-900 mb-2">
                        {t('Daily Sales')}
                      </h2>
                      <p className="text-slate-600">
                        {t('Record cash, card, and credit sales')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>

            {/* Purchases Tile */}
            <button
              type="button"
              onClick={() => navigate('/purchases')}
              className="block w-full text-left"
            >
              <Card className="hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-primary">
                <CardContent className="p-8">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-primary/10 rounded-full">
                      <ShoppingCart className="w-12 h-12 text-primary" />
                    </div>
                    <div className="text-center">
                      <h2 className="text-2xl font-bold text-slate-900 mb-2">
                        {t('Daily Purchases')}
                      </h2>
                      <p className="text-slate-600">
                        {t('Record inventory purchases and restocking')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          </div>
      </div>
    </div>
  );
}
