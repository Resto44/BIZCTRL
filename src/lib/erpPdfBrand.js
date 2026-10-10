import { drawLocalizedPdfText } from './pdfLocalization';

/** Shared BizCTRL report identity. Original PWA icon is fetched same-origin when available. */
export async function loadERPReportIcon() {
  if(typeof window === 'undefined' || typeof fetch !== 'function' || typeof FileReader === 'undefined') return null;
  try {
    const response=await fetch('/icons/bizctrl-icon-192-v2.png',{cache:'force-cache'});
    if(!response.ok) return null;
    const blob=await response.blob();
    return await new Promise(resolve=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(typeof reader.result==='string'?reader.result:null);
      reader.onerror=()=>resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {return null;}
}
export function drawBizCTRLReportIcon(doc,x,y,size=12,iconData=null){
  if(iconData){
    try {doc.addImage(iconData,'PNG',x,y,size,size);return;}catch{/* fallback */}
  }
  // Vector fallback used in offline PDF and synchronous table exports.
  doc.setFillColor(9,25,71);doc.roundedRect(x,y,size,size,size*.19,size*.19,'F');
  const pad=size*.19,gap=size*.055,cell=(size-2*pad-gap)/2;
  const tones=[[24,111,246],[7,203,233],[24,100,236],[36,186,250]];
  for(let i=0;i<4;i++){
    doc.setFillColor(...tones[i]);
    doc.roundedRect(x+pad+(i%2)*(cell+gap),y+pad+Math.floor(i/2)*(cell+gap),
      cell,cell,size*.055,size*.055,'F');
  }
}
export function drawERPReportBrand(doc,{
  lang='en',title='ERP Report',subtitle='',business='',branch='',period='',
  iconData=null,pageLabel='',showTop=true,
}={}){
  const w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight();
  const u=w/210,rtl=lang==='ar'||lang==='fa';
  if(showTop){
    doc.setFillColor(246,250,255);doc.rect(0,0,w,23*u,'F');
    doc.setDrawColor(218,231,249);doc.line(7*u,23*u,w-7*u,23*u);
    drawBizCTRLReportIcon(doc,8*u,4*u,14*u,iconData);
    drawLocalizedPdfText(doc,'BizCTRL',25*u,12*u,{bold:true,size:15,color:[14,29,64],align:'left'});
    drawLocalizedPdfText(doc,'Restaurant ERP System',25*u,18*u,{size:7,color:[95,112,137],align:'left'});
    drawLocalizedPdfText(doc,title,w-8*u,10*u,{rtl,bold:true,size:11,color:[15,39,84],align:'right',maxWidth:92*u});
    drawLocalizedPdfText(doc,[business,branch,period].filter(Boolean).join('  ·  '),w-8*u,18*u,{
      rtl,bold:false,size:6.9,color:[87,104,130],align:'right',maxWidth:95*u});
  }
  doc.setDrawColor(215,230,248);doc.line(7*u,h-13*u,w-7*u,h-13*u);
  drawBizCTRLReportIcon(doc,8*u,h-11*u,8*u,iconData);
  drawLocalizedPdfText(doc,'BizCTRL  ·  ERP Financial Reporting',19*u,h-6*u,{
    size:7.4,bold:true,color:[30,97,214],align:'left'});
  if(pageLabel)drawLocalizedPdfText(doc,pageLabel,w-8*u,h-6*u,{size:7,color:[95,112,137],align:'right'});
}
