import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import OwnerStaffProvisioning from '@/components/owner/OwnerStaffProvisioning';

export default function StaffInvitations() {
  return (
    <div className="mx-auto min-w-0 w-full max-w-6xl space-y-4 pb-24">
      <PageHeader
        title="Staff Invitations"
        subtitle="Create and manage secure invitations for organization staff."
      />
      <OwnerStaffProvisioning />
    </div>
  );
}
