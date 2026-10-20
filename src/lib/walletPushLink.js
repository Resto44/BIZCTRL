import {supabase} from '@/api/supabaseClient';
export const walletRequestId=()=>{
 const id=new URLSearchParams(window.location.search).get('wallet_request');
 return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)?id:null;
};
export async function walletPushRecord(id){
 const {data,error}=await supabase.rpc('erp_wallet_push_record',{p_request:id});
 if(error)throw error;if(!data||data.id!==id||!data.person_id||!data.restaurant_id)throw Error('WALLET_ACCESS_DENIED');return data;
}
