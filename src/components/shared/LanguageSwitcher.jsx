import React from 'react';
import { Check, Languages } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export default function LanguageSwitcher({ compact = false, className }) {
  const { lang, setLang, languages, t } = useLanguage();
  const activeLanguage = languages.find((item) => item.code === lang) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'icon' : 'sm'}
          className={cn('h-8 text-muted-foreground hover:text-foreground gap-1.5', className)}
          aria-label={t('language')}
          title={t('language')}
          data-i18n-skip="true"
        >
          <Languages className="w-4 h-4 shrink-0" aria-hidden="true" />
          {!compact && <span className="hidden xl:inline text-xs font-medium" dir={activeLanguage.direction}>{activeLanguage.nativeName}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" data-i18n-skip="true">
        <DropdownMenuLabel className="text-xs font-medium">{t('language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onSelect={() => setLang(language.code)}
            className="flex items-center justify-between gap-3"
            dir={language.direction}
          >
            <span className="text-sm">{language.nativeName}</span>
            {language.code === lang && <Check className="w-4 h-4 text-primary shrink-0" aria-label={t('selected')} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
