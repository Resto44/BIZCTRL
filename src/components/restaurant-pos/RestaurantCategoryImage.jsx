import {useState} from 'react';
import {UtensilsCrossed} from 'lucide-react';

export function validCategoryImageUrl(value) {
 if(!value)return true;
 try {
  const url=new URL(value);
  return value.length<=2048&&url.protocol==='https:'&&Boolean(url.hostname)&&!url.username&&!url.password&&!/\s/.test(value);
 } catch {return false;}
}

export default function RestaurantCategoryImage({src,className='h-10 w-10 rounded-xl object-cover shrink-0'}) {
 const [failed,setFailed]=useState(null);
 if(!src||!validCategoryImageUrl(src)||failed===src)return <UtensilsCrossed aria-hidden="true" size={24} className="shrink-0"/>;
 return <img src={src} alt="" className={className} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>;
}
