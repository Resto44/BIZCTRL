const months = {
  fa: ['جنوری','فبروری','مارچ','اپریل','می','جون','جولای','آگست','سپتمبر','اکتوبر','نومبر','دسمبر'],
  ar: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
};
const days = { fa:['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'], ar:['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'] };
const englishMonths=['January','February','March','April','May','June','July','August','September','October','November','December'];
const englishDays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const names = new Map();
englishMonths.forEach((name,index)=>{for(const key of [name,name.slice(0,3)]) names.set(key,{kind:'month',index});});
englishDays.forEach((name,index)=>{for(const key of [name,name.slice(0,3)]) names.set(key,{kind:'day',index});});
// Only date-shaped labels: never replace month names inside customer descriptions.
export function translateInterfaceDate(source, lang) {
  if (!months[lang] || !/\d/.test(source)) return undefined;
  const words=source.match(/[A-Za-z]+/g) || [];
  if (!words.length || !words.every(word=>names.has(word)) || !words.some(word=>names.get(word).kind==='month') || /[^A-Za-z0-9\s,./–-]/.test(source)) return undefined;
  return source.replace(/[A-Za-z]+/g, word=>{const entry=names.get(word);return (entry.kind==='month'?months:days)[lang][entry.index];});
}
