import {useState} from 'react';
import {Tag} from 'lucide-react';
import {safeBrandImageUrl} from '@/lib/productBrandMaster';
function LogoImage({url,label,className}) {
 const [failed,setFailed]=useState(false);
 return failed?<Tag aria-hidden="true" className="h-5 w-5 text-muted-foreground"/>:<img src={url} alt={label||''} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)} className={className}/>;
}
export default function BrandLogo({url,label='',className='h-12 w-12'}) {
 const safe=safeBrandImageUrl(url);
 return <span className={'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white dark:bg-slate-900 '+className}>{safe?<LogoImage key={safe} url={safe} label={label} className="h-full w-full object-contain"/>:<Tag aria-hidden="true" className="h-5 w-5 text-muted-foreground"/>}</span>;
}
