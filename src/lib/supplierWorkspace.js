import {supabase} from '@/api/supabaseClient';
export async function postSupplierPayment({requestId,invoiceId,amount,date,paymentMethod='cash',notes=''}) {
 if(!requestId || !invoiceId || !date || !Number.isFinite(Number(amount)) || Number(amount)<=0)throw new Error('Select an invoice and enter a valid amount and date');
 const {data,error}=await supabase.rpc('post_supplier_invoice_payment',{p_request_id:requestId,p_invoice_id:invoiceId,p_amount:Number(amount),p_date:date,p_method:paymentMethod,p_notes:notes});
 if(error)throw error;
 return data;
}
export function supplierOrderItems(value){try{return Array.isArray(value)?value:JSON.parse(value||'[]');}catch{return [];}}
