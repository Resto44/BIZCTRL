import { renderBizctrlTransactionalEmail } from '../_shared/bizctrlEmailTemplate.ts';
type CustomerEmailArgs={customerName:string;invitationUrl:string;expiresAt:string;businessName?:string;businessType?:string};
export function renderCustomerInvitationEmail({customerName,invitationUrl,expiresAt,businessName,businessType}:CustomerEmailArgs){
 try{
  return renderBizctrlTransactionalEmail({kind:'customer',name:customerName,
   businessName,businessType,url:invitationUrl,expiresAt});
 }catch(error){
  if((error as Error)?.message==='INVALID_BIZCTRL_EMAIL_URL')throw new Error('INVALID_CUSTOMER_INVITATION_URL');
  if((error as Error)?.message==='INVALID_BIZCTRL_EMAIL_EXPIRY')throw new Error('INVALID_CUSTOMER_INVITATION_EXPIRY');
  throw error;
 }
}
