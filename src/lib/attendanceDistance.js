export function attendanceDistance(value) {
 if(value==null || !Number.isFinite(Number(value)))return '—';
 const meters=Number(value);
 return meters>=1000?`${(meters/1000).toFixed(2)} km`:`${Math.round(meters)} m`;
}
